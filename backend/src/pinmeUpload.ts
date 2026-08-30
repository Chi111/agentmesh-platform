import { normalizeCid } from './ipfsEvidence';

const DEFAULT_UPLOAD_BASE_URL = 'https://pinme.dev/api/v3';
const MAX_BUNDLE_BYTES = 2 * 1024 * 1024;
const MAX_UPLOAD_CHUNKS = 128;

export interface PinmeUploadEnv {
  PINME_UPLOAD_APP_KEY?: string;
  PINME_UPLOAD_BASE_URL?: string;
}

export interface PinmeBundleFile {
  path: string;
  content: string | Uint8Array;
}

export interface PinmeDirectoryUpload {
  rootCid: string;
  publicUrl: string;
  shortUrl: string | null;
  pinmeUrl: string | null;
  dnsUrl: string | null;
}

export class PinmeUploadError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

interface UploadOptions {
  fetcher?: typeof fetch;
  initialPollDelayMs?: number;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

interface PinmeEnvelope<T> {
  code?: number;
  msg?: string;
  data?: T;
}

export function parsePinmeAppKey(raw: string): { address: string; token: string } {
  const appKey = raw.trim();
  if (appKey.length > 16_000) throw new PinmeUploadError('PINME_APP_KEY_INVALID', 'PinMe AppKey is too long');
  const separator = appKey.indexOf('-');
  if (separator <= 0 || separator >= appKey.length - 1) {
    throw new PinmeUploadError('PINME_APP_KEY_INVALID', 'PinMe AppKey must use the address-token format');
  }
  const address = appKey.slice(0, separator).trim();
  const token = appKey.slice(separator + 1).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9:._]{7,199}$/.test(address) || token.length < 8 || token.length > 15_000) {
    throw new PinmeUploadError('PINME_APP_KEY_INVALID', 'PinMe AppKey contains an invalid address or token');
  }
  return { address, token };
}

function authConfig(env: PinmeUploadEnv): { address: string; token: string; baseUrl: string } {
  const appKey = env.PINME_UPLOAD_APP_KEY?.trim();
  if (!appKey) throw new PinmeUploadError('PINME_UPLOAD_NOT_CONFIGURED', 'PinMe automatic delivery is not configured');
  const parsed = parsePinmeAppKey(appKey);
  return {
    ...parsed,
    baseUrl: (env.PINME_UPLOAD_BASE_URL?.trim() || DEFAULT_UPLOAD_BASE_URL).replace(/\/$/, ''),
  };
}

function safePath(path: string): string {
  const normalized = path.trim();
  if (!normalized || normalized.startsWith('/') || normalized.includes('\\')
    || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new PinmeUploadError('PINME_UPLOAD_INVALID_PATH', `Unsafe bundle path: ${path}`);
  }
  return normalized;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      crcTable[index] = value >>> 0;
    }
  }
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

/** Creates a deterministic, uncompressed ZIP supported by PinMe's directory uploader. */
export function createZip(files: PinmeBundleFile[]): Uint8Array {
  if (files.length < 1) throw new PinmeUploadError('PINME_UPLOAD_EMPTY_BUNDLE', 'Delivery bundle is empty');
  const encoder = new TextEncoder();
  const seen = new Set<string>();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    const path = safePath(file.path);
    if (seen.has(path)) throw new PinmeUploadError('PINME_UPLOAD_DUPLICATE_PATH', `Duplicate bundle path: ${path}`);
    seen.add(path);
    const name = encoder.encode(path);
    const content = typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    const checksum = crc32(content);
    const local = new Uint8Array(30 + name.byteLength);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 33, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, content.byteLength, true);
    localView.setUint32(22, content.byteLength, true);
    localView.setUint16(26, name.byteLength, true);
    local.set(name, 30);
    localParts.push(local, content);

    const central = new Uint8Array(46 + name.byteLength);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 33, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, content.byteLength, true);
    centralView.setUint32(24, content.byteLength, true);
    centralView.setUint16(28, name.byteLength, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localOffset, true);
    central.set(name, 46);
    centralParts.push(central);
    localOffset += local.byteLength + content.byteLength;
  }

  const centralDirectory = concatBytes(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectory.byteLength, true);
  endView.setUint32(16, localOffset, true);
  return concatBytes([...localParts, centralDirectory, end]);
}

function rotateLeft(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

/** MD5 is required by PinMe's chunk protocol for transport integrity, not for evidence security. */
export function md5Hex(input: Uint8Array): string {
  const paddedLength = Math.ceil((input.byteLength + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[input.byteLength] = 0x80;
  const view = new DataView(bytes.buffer);
  const bitLength = input.byteLength * 8;
  view.setUint32(paddedLength - 8, bitLength >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 0x100000000), true);
  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const constants = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0);
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  for (let offset = 0; offset < bytes.byteLength; offset += 64) {
    let a = a0; let b = b0; let c = c0; let d = d0;
    for (let index = 0; index < 64; index += 1) {
      let value: number; let word: number;
      if (index < 16) { value = (b & c) | (~b & d); word = index; }
      else if (index < 32) { value = (d & b) | (~d & c); word = (5 * index + 1) % 16; }
      else if (index < 48) { value = b ^ c ^ d; word = (3 * index + 5) % 16; }
      else { value = c ^ (b | ~d); word = (7 * index) % 16; }
      const previousD = d;
      d = c;
      c = b;
      b = (b + rotateLeft((a + value + constants[index] + view.getUint32(offset + word * 4, true)) >>> 0, shifts[index])) >>> 0;
      a = previousD;
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }
  return [a0, b0, c0, d0].map((word) => [0, 8, 16, 24]
    .map((shift) => ((word >>> shift) & 0xff).toString(16).padStart(2, '0')).join('')).join('');
}

async function envelope<T>(response: Response, action: string): Promise<T> {
  let body: PinmeEnvelope<T>;
  try { body = await response.json() as PinmeEnvelope<T>; }
  catch { throw new PinmeUploadError('PINME_UPLOAD_BAD_RESPONSE', `${action} returned an unreadable response`); }
  if (!response.ok || body.code !== 200 || body.data === undefined) {
    throw new PinmeUploadError('PINME_UPLOAD_REJECTED', `${action} failed: ${body.msg || `HTTP ${response.status}`}`);
  }
  return body.data;
}

function publicUrl(value: unknown, appendPinmeRoot = false): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim().replace(/\/+$/, '');
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (!url.hostname.includes('.')) {
      if (!appendPinmeRoot) return null;
      url.hostname = `${url.hostname}.pinme.dev`;
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export async function uploadPinmeDirectory(
  env: PinmeUploadEnv,
  input: { directoryName: string; files: PinmeBundleFile[] },
  options: UploadOptions = {},
): Promise<PinmeDirectoryUpload> {
  const config = authConfig(env);
  if (!config.address || !config.token) throw new PinmeUploadError('PINME_UPLOAD_NOT_CONFIGURED', 'PinMe automatic delivery is not configured');
  const zip = createZip(input.files);
  if (zip.byteLength > MAX_BUNDLE_BYTES) {
    throw new PinmeUploadError('PINME_UPLOAD_BUNDLE_TOO_LARGE', 'Automatic PinMe delivery bundles must not exceed 2 MiB');
  }
  const fetcher = options.fetcher ?? fetch;
  const headers = { 'token-address': config.address, 'authentication-tokens': config.token };
  const fileName = `${input.directoryName.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 100) || 'agentmesh-delivery'}.zip`;
  const initResponse = await fetcher(`${config.baseUrl}/chunk/init`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_name: fileName, file_size: zip.byteLength, md5: md5Hex(zip), is_directory: true, uid: config.address }),
  });
  const session = await envelope<{ session_id?: string; total_chunks?: number; chunk_size?: number }>(initResponse, 'PinMe upload initialization');
  const sessionId = typeof session.session_id === 'string' ? session.session_id : '';
  const totalChunks = Number(session.total_chunks);
  const chunkSize = Number(session.chunk_size);
  if (!sessionId || !Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > MAX_UPLOAD_CHUNKS
    || !Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new PinmeUploadError('PINME_UPLOAD_BAD_SESSION', 'PinMe returned an invalid upload session');
  }
  if (Math.ceil(zip.byteLength / chunkSize) !== totalChunks) {
    throw new PinmeUploadError('PINME_UPLOAD_BAD_SESSION', 'PinMe upload session chunk count does not match the delivery bundle');
  }

  for (let index = 0; index < totalChunks; index += 1) {
    const chunk = zip.slice(index * chunkSize, Math.min((index + 1) * chunkSize, zip.byteLength));
    const form = new FormData();
    form.append('session_id', sessionId);
    form.append('chunk_index', String(index));
    form.append('uid', config.address);
    const bytes = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer;
    form.append('chunk', new Blob([bytes], { type: 'application/octet-stream' }), `chunk_${index}`);
    await envelope(await fetcher(`${config.baseUrl}/chunk/upload`, { method: 'POST', headers, body: form }), `PinMe chunk ${index + 1} upload`);
  }

  const completed = await envelope<{ trace_id?: string }>(await fetcher(`${config.baseUrl}/chunk/complete`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, uid: config.address, action: 'upload' }),
  }), 'PinMe upload completion');
  const traceId = typeof completed.trace_id === 'string' ? completed.trace_id : '';
  if (!traceId) throw new PinmeUploadError('PINME_UPLOAD_BAD_RESPONSE', 'PinMe did not return an upload trace ID');

  const initialPollDelayMs = options.initialPollDelayMs ?? 5_000;
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const timeoutMs = options.timeoutMs ?? 45_000;
  await delay(initialPollDelayMs);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const query = new URLSearchParams({ trace_id: traceId, uid: config.address });
    const status = await envelope<{ is_ready?: boolean; upload_rst?: Record<string, unknown> }>(
      await fetcher(`${config.baseUrl}/up_status?${query}`, { headers: { ...headers, 'Content-Type': 'application/json' } }),
      'PinMe upload status',
    );
    const result = status.upload_rst;
    if (status.is_ready && result && typeof result.Hash === 'string') {
      const rootCid = normalizeCid(result.Hash);
      const dnsUrl = publicUrl(result.dns_domain);
      const pinmeUrl = publicUrl(result.pinme_domain, true);
      const shortUrl = publicUrl(result.ShortUrl, true);
      return {
        rootCid,
        publicUrl: dnsUrl ?? pinmeUrl ?? shortUrl ?? `https://ipfs.io/ipfs/${rootCid}/`,
        shortUrl, pinmeUrl, dnsUrl,
      };
    }
    await delay(pollIntervalMs);
  }
  throw new PinmeUploadError('PINME_UPLOAD_TIMEOUT', 'PinMe did not finish publishing the delivery bundle in time');
}
