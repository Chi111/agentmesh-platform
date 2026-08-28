import { createPublicClient, getAddress, http, isAddress, type Address } from 'viem';
import { mainnet } from 'viem/chains';

const ENS_RPC_TIMEOUT_MS = 6_000;
const ENS_CACHE_TTL_MS = 30 * 60 * 1_000;
const ENS_NEGATIVE_CACHE_TTL_MS = 2 * 60 * 1_000;

interface EnsCacheEntry {
  expiresAt: number;
  name: string | null;
}

export type EnsLookup = (address: Address) => Promise<string | null>;

const configuredRpcUrl = import.meta.env.VITE_ENS_RPC_URL?.trim();
const ensClient = createPublicClient({
  chain: mainnet,
  transport: http(configuredRpcUrl || undefined, {
    retryCount: 1,
    timeout: ENS_RPC_TIMEOUT_MS,
  }),
});

function normalizeAddress(address: string | null | undefined): Address | null {
  if (!address || !isAddress(address, { strict: false })) return null;
  return getAddress(address);
}

function sanitizeEnsName(name: string | null): string | null {
  const normalized = name?.trim();
  return normalized && normalized.length <= 255 ? normalized : null;
}

export function createEnsNameResolver(lookup: EnsLookup) {
  const cache = new Map<string, EnsCacheEntry>();
  const pending = new Map<string, Promise<string | null>>();

  return async (address: string | null | undefined): Promise<string | null> => {
    const normalizedAddress = normalizeAddress(address);
    if (!normalizedAddress) return null;

    const key = normalizedAddress.toLocaleLowerCase();
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.name;

    const existing = pending.get(key);
    if (existing) return existing;

    const request = lookup(normalizedAddress)
      .then((name) => {
        const safeName = sanitizeEnsName(name);
        cache.set(key, {
          name: safeName,
          expiresAt: Date.now() + (safeName ? ENS_CACHE_TTL_MS : ENS_NEGATIVE_CACHE_TTL_MS),
        });
        return safeName;
      })
      .catch(() => {
        cache.set(key, { name: null, expiresAt: Date.now() + ENS_NEGATIVE_CACHE_TTL_MS });
        return null;
      })
      .finally(() => pending.delete(key));

    pending.set(key, request);
    return request;
  };
}

export const resolveEnsName = createEnsNameResolver((address) => ensClient.getEnsName({ address }));

export function shortWalletAddress(address: string | null | undefined): string | null {
  const normalizedAddress = normalizeAddress(address);
  if (!normalizedAddress) return null;
  return `${normalizedAddress.slice(0, 6)}…${normalizedAddress.slice(-4)}`;
}
