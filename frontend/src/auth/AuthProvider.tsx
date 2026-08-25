import { type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { setApiTokenProvider } from '../services/api';
import type { UserProfile } from '../types/domain';
import { AuthContext, type AuthContextValue, type AuthProviderName } from './context';
import { privyAppId } from './config';

function e2eAuthEnabled(): boolean {
  if (import.meta.env.MODE !== 'e2e' || import.meta.env.VITE_E2E_AUTH !== 'true') return false;
  try {
    return window.sessionStorage.getItem('agentmesh:e2e-auth') === 'true';
  } catch {
    return false;
  }
}

async function initializing(): Promise<never> {
  throw new Error('身份服务仍在初始化，请稍后重试。');
}

function initialAuthValue(provider: AuthProviderName): AuthContextValue {
  return {
    status: 'loading',
    profile: null,
    error: null,
    provider,
    linkedWalletAddress: null,
    walletAddress: null,
    onchainSettlement: false,
    loginWithEmail: initializing,
    loginWithGoogle: initializing,
    loginWithPrivy: initializing,
    register: initializing,
    linkWallet: initializing,
    depositEscrow: initializing,
    releaseEscrow: initializing,
    freezeEscrow: initializing,
    unfreezeEscrow: initializing,
    refundEscrow: initializing,
    signOut: async () => undefined,
    refreshProfile: async () => null,
  };
}

const e2eProfile: UserProfile = {
  id: 'USER-e2e-requester',
  email: 'requester@example.test',
  displayName: 'E2E Requester',
  role: 'requester',
};

function e2eAuthValue(): AuthContextValue {
  return {
    ...initialAuthValue('pinme'),
    status: 'authenticated',
    profile: e2eProfile,
    refreshProfile: async () => e2eProfile,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Browser tests opt in per page. Keeping the flag out of global test state
  // means authentication-gate tests still exercise the real anonymous path.
  const e2eAuth = e2eAuthEnabled();
  const provider: AuthProviderName = privyAppId ? 'privy' : 'pinme';
  const controllerHost = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState<AuthContextValue>(() => e2eAuth ? e2eAuthValue() : initialAuthValue(provider));
  const handleChange = useCallback((nextValue: AuthContextValue) => setValue(nextValue), []);

  useEffect(() => {
    if (e2eAuth) {
      // StrictMode mounts effects twice in development. Install the test-only
      // provider for every mount so the first cleanup cannot clear the session.
      setApiTokenProvider(async () => 'e2e-test-token');
      return () => setApiTokenProvider(null);
    }
    let active = true;
    let controllerRoot: Root | null = null;
    const controllerModule = privyAppId
      ? import('./PrivyAuthProvider').then((module) => module.PrivyAuthController)
      : import('./FirebaseAuthProvider').then((module) => module.FirebaseAuthController);

    void controllerModule.then((Controller) => {
      if (!active || !controllerHost.current) return;
      controllerRoot = createRoot(controllerHost.current);
      controllerRoot.render(<Controller onChange={handleChange} />);
    }).catch((error: unknown) => {
      if (!active) return;
      setValue((current) => ({
        ...current,
        status: 'error',
        error: error instanceof Error ? error.message : '身份服务加载失败，请刷新后重试。',
      }));
    });

    return () => {
      active = false;
      controllerRoot?.unmount();
    };
  }, [e2eAuth, handleChange]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      <div ref={controllerHost} style={{ display: 'contents' }} />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
