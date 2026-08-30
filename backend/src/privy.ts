import { createRemoteJWKSet, decodeJwt, importJWK, importSPKI, jwtVerify, type JWK } from 'jose';
import { BRAND } from '../../shared/brand';
import type { VerifiedIdentity } from './pinme';

export interface PrivyEnv {
  PRIVY_APP_ID?: string;
  PRIVY_VERIFICATION_KEY?: string;
  PRIVY_JWKS_URL?: string;
}

// Privy app IDs and JWKS endpoints are public verification configuration. PinMe
// currently does not persist custom Worker bindings, so the AgentMesh deployment
// uses its public app ID by default while still allowing runtime overrides.
const AGENTMESH_PRIVY_APP_ID = 'cmsy8bn4k00j10djrfome4ddj';
const remoteVerificationKeys = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

type VerificationResult = {
  identity?: VerifiedIdentity;
  status: number;
  error?: string;
};

type LinkedAccount = Record<string, unknown> & { type?: string };

export function isPrivyConfigured(env: PrivyEnv): boolean {
  return Boolean(privyAppId(env));
}

// This only routes the token to the correct verifier. The decoded issuer is never
// trusted as identity data; jwtVerify below still validates the signature and claims.
export function looksLikePrivyToken(token: string): boolean {
  try {
    return decodeJwt(token).iss === 'privy.io';
  } catch {
    return false;
  }
}

async function importVerificationKey(value: string) {
  const normalized = value.trim().replace(/\\n/g, '\n');
  if (normalized.startsWith('{')) {
    return importJWK(JSON.parse(normalized) as JWK, 'ES256');
  }
  return importSPKI(normalized, 'ES256');
}

function privyAppId(env: PrivyEnv): string {
  return env.PRIVY_APP_ID?.trim() || AGENTMESH_PRIVY_APP_ID;
}

async function privyVerificationKey(env: PrivyEnv, appId: string) {
  const configuredKey = env.PRIVY_VERIFICATION_KEY?.trim();
  if (configuredKey) return importVerificationKey(configuredKey);

  const jwksUrl = env.PRIVY_JWKS_URL?.trim()
    || `https://auth.privy.io/api/v1/apps/${encodeURIComponent(appId)}/jwks.json`;
  let remoteKey = remoteVerificationKeys.get(jwksUrl);
  if (!remoteKey) {
    remoteKey = createRemoteJWKSet(new URL(jwksUrl));
    remoteVerificationKeys.set(jwksUrl, remoteKey);
  }
  return remoteKey;
}

export async function verifyPrivyToken(env: PrivyEnv, accessToken: string): Promise<VerificationResult> {
  const appId = privyAppId(env);
  if (!appId) {
    return { status: 503, error: 'Privy authentication is not configured' };
  }

  try {
    const key = await privyVerificationKey(env, appId);
    const { payload } = await jwtVerify(accessToken, key, {
      algorithms: ['ES256'],
      issuer: 'privy.io',
      audience: appId,
    });
    if (typeof payload.sub !== 'string' || !payload.sub.startsWith('did:privy:')) {
      return { status: 401, error: 'Privy token subject is invalid' };
    }

    return {
      status: 200,
      identity: {
        uid: payload.sub,
        provider: 'privy',
        displayName: BRAND.platform.defaultUserName,
        claims: {
          authProvider: 'privy',
          ...(typeof payload.sid === 'string' ? { sessionId: payload.sid } : {}),
        },
      },
    };
  } catch {
    return { status: 401, error: 'Privy access token is invalid or expired' };
  }
}

function parseLinkedAccounts(value: unknown): LinkedAccount[] {
  const parsed = typeof value === 'string' ? (() => {
    try { return JSON.parse(value) as unknown; } catch { return []; }
  })() : value;
  return Array.isArray(parsed)
    ? parsed.filter((account): account is LinkedAccount => Boolean(account) && typeof account === 'object')
    : [];
}

function accountText(account: LinkedAccount | undefined, keys: string[]): string | undefined {
  if (!account) return undefined;
  for (const key of keys) {
    const value = account[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function isEmbeddedWallet(account: LinkedAccount): boolean {
  const walletClientType = accountText(account, ['wallet_client_type', 'walletClientType'])?.toLocaleLowerCase();
  const connectorType = accountText(account, ['connector_type', 'connectorType'])?.toLocaleLowerCase();
  return walletClientType === 'privy'
    || walletClientType === 'privy-v2'
    || connectorType === 'embedded';
}

export async function verifyPrivyIdentityToken(
  env: PrivyEnv,
  identityToken: string,
  expectedSubject: string,
): Promise<VerificationResult> {
  const appId = privyAppId(env);
  if (!appId) return { status: 503, error: 'Privy authentication is not configured' };

  try {
    const key = await privyVerificationKey(env, appId);
    const { payload } = await jwtVerify(identityToken, key, {
      algorithms: ['ES256'],
      issuer: 'privy.io',
      audience: appId,
    });
    if (payload.sub !== expectedSubject) return { status: 401, error: 'Privy identity token subject does not match the session' };

    const accounts = parseLinkedAccounts(payload.linked_accounts);
    const emailAccount = accounts.find((account) => account.type === 'email')
      ?? accounts.find((account) => account.type?.includes('oauth') && accountText(account, ['email', 'address']));
    // Google/email authentication is Web2-only. Only a wallet the user
    // explicitly connected can become the Web3 settlement identity.
    const walletAccount = accounts.find((account) => (
      account.type === 'wallet'
      && accountText(account, ['address'])
      && accountText(account, ['chain_type', 'chainType'])?.toLocaleLowerCase() !== 'solana'
      && !isEmbeddedWallet(account)
    ));
    const email = accountText(emailAccount, ['address', 'email'])?.toLocaleLowerCase();
    const walletAddress = accountText(walletAccount, ['address'])?.toLocaleLowerCase();
    const displayName = accountText(emailAccount, ['name'])
      ?? email?.split('@')[0]
      ?? (walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : BRAND.platform.defaultUserName);

    return {
      status: 200,
      identity: {
        uid: expectedSubject,
        provider: 'privy',
        email,
        walletAddress,
        walletAddressAuthoritative: true,
        displayName,
        claims: {
          authProvider: 'privy',
          linkedAccountTypes: [...new Set(accounts.map((account) => account.type).filter(Boolean))],
        },
      },
    };
  } catch {
    return { status: 401, error: 'Privy identity token is invalid or expired' };
  }
}
