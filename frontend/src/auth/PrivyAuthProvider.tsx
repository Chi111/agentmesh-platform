import {
  getIdentityToken,
  PrivyProvider,
  usePrivy,
  useSendTransaction,
  type User as PrivyUser,
} from '@privy-io/react-auth';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { sepolia } from 'viem/chains';
import { api, setApiTokenProvider } from '../services/api';
import {
  depositEscrow as submitEscrowDeposit,
  freezeEscrow as submitEscrowFreeze,
  onchainSettlementConfigured,
  refundEscrow as submitEscrowRefund,
  releaseEscrow as submitEscrowRelease,
  unfreezeEscrow as submitEscrowUnfreeze,
} from '../services/settlement';
import type { UserProfile } from '../types/domain';
import { privyAppId, privyClientId, privyLoginMethods } from './config';
import { type AuthContextValue, type AuthStatus, readableAuthError } from './context';

function privyIdentity(user: PrivyUser) {
  const walletAddress = user.wallet?.address
    ?? user.linkedAccounts.find((account) => account.type === 'wallet')?.address
    ?? null;
  const email = user.email?.address ?? user.google?.email;
  const displayName = user.google?.name?.trim()
    || email?.split('@')[0]
    || (walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : 'AgentMesh User');
  return { walletAddress, email, displayName };
}

function PrivySession({ onChange }: { onChange: (value: AuthContextValue) => void }) {
  const { ready, authenticated, user, error: privyError, getAccessToken, login, logout, linkWallet: openLinkWallet } = usePrivy();
  const { sendTransaction } = useSendTransaction();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const identity = user ? privyIdentity(user) : null;
  const chainEnabled = onchainSettlementConfigured();

  const tokenBundle = useCallback(async () => {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error('Privy access token is unavailable');
    return { accessToken, identityToken: await getIdentityToken() };
  }, [getAccessToken]);

  const verifySession = useCallback(async () => {
    if (!user) return null;
    const tokens = await tokenBundle();
    setApiTokenProvider(tokenBundle);
    const { profile: serverProfile } = await api.verifySession(tokens.accessToken, tokens.identityToken);
    const nextProfile: UserProfile = {
      ...serverProfile,
      email: serverProfile.email ?? identity?.email,
      displayName: serverProfile.displayName === 'AgentMesh User' ? identity?.displayName ?? serverProfile.displayName : serverProfile.displayName,
      walletAddress: serverProfile.walletAddress ?? identity?.walletAddress ?? undefined,
    };
    setProfile(nextProfile);
    return nextProfile;
  }, [identity?.displayName, identity?.email, identity?.walletAddress, tokenBundle, user]);

  useEffect(() => {
    let active = true;
    if (!ready) {
      setStatus('loading');
      return () => { active = false; };
    }
    if (!authenticated || !user) {
      setApiTokenProvider(null);
      setProfile(null);
      setStatus(privyError ? 'error' : 'anonymous');
      setError(privyError ? readableAuthError(privyError) : null);
      return () => { active = false; };
    }
    setStatus('loading');
    void verifySession().then(() => {
      if (!active) return;
      setStatus('authenticated');
      setError(null);
    }).catch((authError) => {
      if (!active) return;
      setApiTokenProvider(null);
      setProfile(null);
      setStatus('error');
      setError(readableAuthError(authError));
    });
    return () => { active = false; };
  }, [authenticated, privyError, ready, user, verifySession]);

  const openLogin = useCallback(async () => {
    setError(null);
    login({ loginMethods: privyLoginMethods });
  }, [login]);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    profile,
    error,
    provider: 'privy',
    walletAddress: identity?.walletAddress ?? null,
    onchainSettlement: chainEnabled,
    loginWithEmail: openLogin,
    loginWithGoogle: openLogin,
    loginWithPrivy: openLogin,
    register: openLogin,
    linkWallet: async () => { openLinkWallet({ walletChainType: 'ethereum-only' }); },
    depositEscrow: async (missionId, amount, paymentMethod, recipients) => {
      if (!identity?.walletAddress) throw new Error('请先关联钱包后再提交链上托管。');
      return submitEscrowDeposit(sendTransaction, identity.walletAddress, missionId, amount, paymentMethod, recipients);
    },
    releaseEscrow: async (missionId, recipients) => submitEscrowRelease(sendTransaction, missionId, recipients),
    freezeEscrow: async (missionId) => submitEscrowFreeze(sendTransaction, missionId),
    unfreezeEscrow: async (missionId) => submitEscrowUnfreeze(sendTransaction, missionId),
    refundEscrow: async (missionId) => submitEscrowRefund(sendTransaction, missionId),
    signOut: async () => {
      await logout();
      setApiTokenProvider(null);
      setProfile(null);
      setStatus('anonymous');
    },
    refreshProfile: verifySession,
  }), [chainEnabled, error, identity?.walletAddress, logout, openLinkWallet, openLogin, profile, sendTransaction, status, verifySession]);

  useEffect(() => onChange(value), [onChange, value]);

  return null;
}

export function PrivyAuthController({ onChange }: { onChange: (value: AuthContextValue) => void }) {
  return (
    <PrivyProvider
      appId={privyAppId!}
      clientId={privyClientId || undefined}
      config={{
        loginMethods: privyLoginMethods,
        appearance: {
          theme: 'light',
          accentColor: '#00B8D9',
          landingHeader: '进入 AgentMesh',
          loginMessage: '使用邮箱或钱包签名进入同一个工作区',
          showWalletLoginFirst: false,
          walletChainType: 'ethereum-only',
          walletList: ['metamask', 'coinbase_wallet', 'rainbow', 'base_account', 'wallet_connect'],
        },
        embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
        defaultChain: sepolia,
        supportedChains: [sepolia],
      }}
    >
      <PrivySession onChange={onChange} />
    </PrivyProvider>
  );
}
