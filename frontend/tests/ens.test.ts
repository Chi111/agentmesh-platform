import { describe, expect, it, vi } from 'vitest';
import { createEnsNameResolver, shortWalletAddress } from '../src/services/ens';

const wallet = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

describe('ENS wallet identity', () => {
  it('deduplicates and caches verified primary-name lookups', async () => {
    let release: ((name: string) => void) | undefined;
    const lookup = vi.fn(() => new Promise<string>((resolve) => { release = resolve; }));
    const resolveName = createEnsNameResolver(lookup);

    const first = resolveName(wallet);
    const second = resolveName(wallet.toLocaleLowerCase());
    expect(lookup).toHaveBeenCalledTimes(1);

    release?.('vitalik.eth');
    await expect(first).resolves.toBe('vitalik.eth');
    await expect(second).resolves.toBe('vitalik.eth');
    await expect(resolveName(wallet)).resolves.toBe('vitalik.eth');
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('falls back cleanly when the address is invalid or lookup fails', async () => {
    const lookup = vi.fn().mockRejectedValue(new Error('RPC unavailable'));
    const resolveName = createEnsNameResolver(lookup);

    await expect(resolveName('not-an-address')).resolves.toBeNull();
    await expect(resolveName(wallet)).resolves.toBeNull();
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('formats the wallet fallback consistently', () => {
    expect(shortWalletAddress(wallet)).toBe('0xd8dA…6045');
    expect(shortWalletAddress('invalid')).toBeNull();
  });
});
