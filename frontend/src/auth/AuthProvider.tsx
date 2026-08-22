import { type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AuthContext, type AuthContextValue, type AuthProviderName } from './context';
import { privyAppId } from './config';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const provider: AuthProviderName = privyAppId ? 'privy' : 'pinme';
  const controllerHost = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState<AuthContextValue>(() => initialAuthValue(provider));
  const handleChange = useCallback((nextValue: AuthContextValue) => setValue(nextValue), []);

  useEffect(() => {
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
  }, [handleChange]);

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
