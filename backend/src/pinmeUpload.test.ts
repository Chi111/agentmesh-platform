import { describe, expect, it } from 'vitest';
import { createZip, md5Hex, PinmeUploadError, uploadPinmeDirectory } from './pinmeUpload';

const encoder = new TextEncoder();

describe('PinMe automatic delivery upload', () => {
  it('creates a valid deterministic ZIP directory', () => {
    const first = createZip([{ path: 'index.html', content: '<h1>Hello</h1>' }, { path: 'manifest.json', content: '{}' }]);
    const second = createZip([{ path: 'manifest.json', content: '{}' }, { path: 'index.html', content: '<h1>Hello</h1>' }]);
    expect([...first]).toEqual([...second]);
    expect(new DataView(first.buffer).getUint32(0, true)).toBe(0x04034b50);
    expect(new DataView(first.buffer).getUint32(first.byteLength - 22, true)).toBe(0x06054b50);
  });

  it('computes the MD5 transport checksum expected by PinMe', () => {
    expect(md5Hex(encoder.encode(''))).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(md5Hex(encoder.encode('abc'))).toBe('900150983cd24fb0d6963f7d28e17f72');
  });

  it('uploads the bundle and returns the immutable CID plus PinMe URL', async () => {
    const calls: string[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input); calls.push(url);
      if (url.endsWith('/chunk/init')) return Response.json({ code: 200, data: { session_id: 'session-1', total_chunks: 1, chunk_size: 100_000 } });
      if (url.endsWith('/chunk/upload')) {
        expect(init?.body).toBeInstanceOf(FormData);
        return Response.json({ code: 200, data: { uploaded: true } });
      }
      if (url.endsWith('/chunk/complete')) return Response.json({ code: 200, data: { trace_id: 'trace-1' } });
      return Response.json({ code: 200, data: { is_ready: true, upload_rst: {
        Hash: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3bn5o2viwzgr4c6a3b6pydf4y',
        ShortUrl: 'short.pinme.dev', pinme_domain: 'delivery-123', dns_domain: null,
      } } });
    };
    const result = await uploadPinmeDirectory({ PINME_UPLOAD_APP_KEY: '0xabcdef12-test-upload-token' }, {
      directoryName: 'client-delivery', files: [{ path: 'index.html', content: '<h1>成品</h1>' }],
    }, { fetcher, initialPollDelayMs: 0, pollIntervalMs: 0, timeoutMs: 10 });
    expect(result.rootCid).toBe('bafybeigdyrzt5sfp7udm7hu76uh7y26nf3bn5o2viwzgr4c6a3b6pydf4y');
    expect(result.publicUrl).toBe('https://delivery-123.pinme.dev');
    expect(calls).toHaveLength(4);
  });

  it('expands a PinMe short publication code into a public domain', async () => {
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/chunk/init')) return Response.json({ code: 200, data: { session_id: 'session-short', total_chunks: 1, chunk_size: 100_000 } });
      if (url.endsWith('/chunk/upload')) {
        expect(init?.body).toBeInstanceOf(FormData);
        return Response.json({ code: 200, data: { uploaded: true } });
      }
      if (url.endsWith('/chunk/complete')) return Response.json({ code: 200, data: { trace_id: 'trace-short' } });
      return Response.json({ code: 200, data: { is_ready: true, upload_rst: {
        Hash: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3bn5o2viwzgr4c6a3b6pydf4y',
        ShortUrl: '688355bf/', pinme_domain: null, dns_domain: null,
      } } });
    };
    const result = await uploadPinmeDirectory({ PINME_UPLOAD_APP_KEY: '0xabcdef12-test-upload-token' }, {
      directoryName: 'short-code-delivery', files: [{ path: 'index.html', content: '<h1>完整成果包</h1>' }],
    }, { fetcher, initialPollDelayMs: 0, pollIntervalMs: 0, timeoutMs: 10 });
    expect(result.shortUrl).toBe('https://688355bf.pinme.dev');
    expect(result.publicUrl).toBe('https://688355bf.pinme.dev');
  });

  it('fails closed when the service AppKey is missing', async () => {
    await expect(uploadPinmeDirectory({}, { directoryName: 'delivery', files: [{ path: 'index.html', content: 'x' }] }))
      .rejects.toMatchObject<Partial<PinmeUploadError>>({ code: 'PINME_UPLOAD_NOT_CONFIGURED' });
  });
});
