import { describe, expect, it } from 'vitest';
import { openUserPinmeAppKey, pinmeAddressHint, sealUserPinmeAppKey } from './pinmeCredentials';

describe('user PinMe credential vault', () => {
  const env = { API_KEY: 'project-root-secret' };

  it('encrypts AppKeys at rest and decrypts only for the same user', async () => {
    const appKey = '0x1234567890abcdef-super-secret-token';
    const sealed = await sealUserPinmeAppKey(env, 'requester-1', appKey, '2026-08-29T00:00:00.000Z');
    expect(sealed.addressHint).toBe('0x12345…cdef');
    expect(sealed.ciphertext).not.toContain('super-secret-token');
    expect(await openUserPinmeAppKey(env, sealed)).toBe(appKey);
    await expect(openUserPinmeAppKey(env, { ...sealed, userId: 'requester-2' })).rejects.toThrow();
  });

  it('masks long addresses without exposing the token', () => {
    expect(pinmeAddressHint('0x1234567890abcdef')).toBe('0x12345…cdef');
  });
});
