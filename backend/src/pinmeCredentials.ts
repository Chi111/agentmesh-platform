import type { UserPinmeCredentialRecord } from './contracts';
import type { PinmeEnv } from './pinme';
import { parsePinmeAppKey } from './pinmeUpload';

const encoder = new TextEncoder();

function encodeBase64Url(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid base64url');
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

async function credentialKey(env: PinmeEnv): Promise<CryptoKey> {
  if (!env.API_KEY?.trim()) throw new Error('PINME_CREDENTIAL_ROOT_KEY_UNAVAILABLE');
  const keyBytes = await crypto.subtle.digest('SHA-256', encoder.encode(`agentmesh-user-pinme-credentials:v1\n${env.API_KEY}`));
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export function pinmeAddressHint(address: string): string {
  const value = address.trim();
  if (value.length <= 12) return value;
  return `${value.slice(0, 7)}…${value.slice(-4)}`;
}

export async function sealUserPinmeAppKey(
  env: PinmeEnv,
  userId: string,
  appKey: string,
  updatedAt: string,
): Promise<UserPinmeCredentialRecord> {
  const { address } = parsePinmeAppKey(appKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({
    name: 'AES-GCM',
    iv,
    additionalData: encoder.encode(`agentmesh-user-pinme:${userId}:v1`),
  }, await credentialKey(env), encoder.encode(appKey.trim())));
  return {
    userId,
    addressHint: pinmeAddressHint(address),
    ciphertext: encodeBase64Url(ciphertext),
    iv: encodeBase64Url(iv),
    updatedAt,
  };
}

export async function openUserPinmeAppKey(env: PinmeEnv, credential: UserPinmeCredentialRecord): Promise<string> {
  const plaintext = await crypto.subtle.decrypt({
    name: 'AES-GCM',
    iv: decodeBase64Url(credential.iv) as BufferSource,
    additionalData: encoder.encode(`agentmesh-user-pinme:${credential.userId}:v1`),
  }, await credentialKey(env), decodeBase64Url(credential.ciphertext) as BufferSource);
  const appKey = new TextDecoder().decode(plaintext).trim();
  parsePinmeAppKey(appKey);
  return appKey;
}
