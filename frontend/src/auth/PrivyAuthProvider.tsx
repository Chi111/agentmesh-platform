import {
  PrivyProvider,
  useConnectWallet,
  useIdentityToken,
  usePrivy,
  useWallets,
  type User as PrivyUser,
} from '@privy-io/react-auth';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { numberToHex, type Hex } from 'viem';
import { sepolia } from 'viem/chains';
import { api, setApiTokenProvider } from '../services/api';
import { BRAND, isDefaultPlatformUserName } from '../constants/brand';
import {
  depositEscrow as submitEscrowDeposit,
  freezeEscrow as submitEscrowFreeze,
  onchainSettlementConfigured,
  prepareSettlementTransaction,
  refundEscrow as submitEscrowRefund,
  releaseEscrow as submitEscrowRelease,
  unfreezeEscrow as submitEscrowUnfreeze,
  type SettlementTransaction,
} from '../services/settlement';
import type { UserProfile } from '../types/domain';
import { submitYdAction, ydWalletConfigured } from '../services/ydFinance';
import { privyAppId, privyClientId, privyLoginMethods } from './config';
import { type AuthContextValue, type AuthStatus, readableAuthError } from './context';

function privyIdentity(user: PrivyUser) {
  const walletAddress = user.wallet?.address
    ?? user.linkedAccounts.find((account) => account.type === 'wallet')?.address
    ?? null;
  const email = user.email?.address ?? user.google?.email;
  const displayName = user.google?.name?.trim()
    || email?.split('@')[0]
    || (walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : BRAND.platform.defaultUserName);
  return { walletAddress, email, displayName };
}

function connectedWalletError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (
    message.includes('Disconnected from MetaMask background')
    || message.includes('ExtensionPortStream')
    || message.includes('Provider disconnected')
  ) {
    return new Error('MetaMask 扩展连接已中断，请刷新页面后重试。钱包身份仍然保留，无需重新绑定。');
  }
  return error instanceof Error ? error : new Error('钱包交易请求失败，请检查钱包扩展后重试。');
}

function PrivySession({ onChange }: { onChange: (value: AuthContextValue) => void }) {
  const { ready, authenticated, user, error: privyError, getAccessToken, login, logout, linkWallet: openLinkWallet } = usePrivy();
  const { connectWallet } = useConnectWallet();
  const { identityToken } = useIdentityToken();
  const { ready: walletsReady, wallets } = useWallets();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const identity = user ? privyIdentity(user) : null;
  const connectedWallet = useMemo(() => {
    const verifiedAddress = identity?.walletAddress?.toLocaleLowerCase();
    if (!walletsReady || !verifiedAddress) return null;
    return wallets.find((wallet) => wallet.address.toLocaleLowerCase() === verifiedAddress) ?? null;
  }, [identity?.walletAddress, wallets, walletsReady]);
  const chainEnabled = onchainSettlementConfigured();

  const sendConnectedTransaction = useCallback(async (input: SettlementTransaction) => {
    if (!walletsReady) throw new Error('正在读取钱包连接状态，请稍后重试。');
    if (!connectedWallet) {
      throw new Error('已绑定的钱包当前未连接，请刷新页面或重新连接钱包后再提交交易。');
    }
    try {
      if (!await connectedWallet.isConnected()) throw new Error('Provider disconnected');
      const chainParts = connectedWallet.chainId.split(':');
      const currentChainId = Number(chainParts[chainParts.length - 1]);
      if (currentChainId !== input.chainId) await connectedWallet.switchChain(input.chainId);
      const preparedInput = await prepareSettlementTransaction(connectedWallet.address, input);
      const provider = await connectedWallet.getEthereumProvider();
      const hash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: connectedWallet.address,
          to: preparedInput.to,
          data: preparedInput.data,
          ...(preparedInput.value === undefined ? {} : { value: numberToHex(preparedInput.value) }),
          ...(preparedInput.gasLimit === undefined ? {} : { gas: numberToHex(preparedInput.gasLimit) }),
        }],
      });
      if (typeof hash !== 'string' || !hash.startsWith('0x')) throw new Error('钱包未返回有效的交易哈希。');
      return { hash: hash as Hex };
    } catch (transactionError) {
      throw connectedWalletError(transactionError);
    }
  }, [connectedWallet, walletsReady]);

  const tokenBundle = useCallback(async () => {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error('Privy access token is unavailable');
    return { accessToken, identityToken };
  }, [getAccessToken, identityToken]);

  const verifySession = useCallback(async () => {
    if (!user) return null;
    const tokens = await tokenBundle();
    setApiTokenProvider(tokenBundle);
    const { profile: serverProfile } = await api.verifySession(tokens.accessToken, tokens.identityToken);
    const nextProfile: UserProfile = {
      ...serverProfile,
      email: serverProfile.email ?? identity?.email,
      displayName: isDefaultPlatformUserName(serverProfile.displayName) ? identity?.displayName ?? BRAND.platform.defaultUserName : serverProfile.displayName,
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
    linkedWalletAddress: identity?.walletAddress ?? profile?.walletAddress ?? null,
    walletAddress: connectedWallet?.address ?? null,
    ensName: null,
    onchainSettlement: chainEnabled,
    ydWalletEnabled: ydWalletConfigured(),
    loginWithEmail: openLogin,
    loginWithGoogle: openLogin,
    loginWithPrivy: openLogin,
    register: openLogin,
    linkWallet: async () => {
      if (identity?.walletAddress) {
        connectWallet({
          walletChainType: 'ethereum-only',
          suggestedAddress: identity.walletAddress,
          description: '重新连接已绑定的钱包，以继续 Sepolia 链上支付。',
        });
        return;
      }
      openLinkWallet({ walletChainType: 'ethereum-only' });
    },
    depositEscrow: async (missionId, amount, paymentMethod, recipients) => {
      const settlementWalletAddress = connectedWallet?.address ?? identity?.walletAddress;
      if (!settlementWalletAddress) throw new Error('请先连接已验证的钱包后再提交链上托管。');
      return submitEscrowDeposit(sendConnectedTransaction, settlementWalletAddress, missionId, amount, paymentMethod, recipients);
    },
    releaseEscrow: async (missionId, recipients) => submitEscrowRelease(sendConnectedTransaction, missionId, recipients),
    freezeEscrow: async (missionId) => submitEscrowFreeze(sendConnectedTransaction, missionId),
    unfreezeEscrow: async (missionId) => submitEscrowUnfreeze(sendConnectedTransaction, missionId),
    refundEscrow: async (missionId) => submitEscrowRefund(sendConnectedTransaction, missionId),
    submitYdAction: async (action) => {
      const ydWalletAddress = connectedWallet?.address ?? identity?.walletAddress;
      if (!ydWalletAddress) throw new Error(`请先连接已验证的钱包后再提交 ${BRAND.contribution.symbol} 交易。`);
      return submitYdAction(sendConnectedTransaction, ydWalletAddress, action);
    },
    signOut: async () => {
      await logout();
      setApiTokenProvider(null);
      setProfile(null);
      setStatus('anonymous');
    },
    refreshProfile: verifySession,
  }), [chainEnabled, connectWallet, connectedWallet, error, identity?.walletAddress, logout, openLinkWallet, openLogin, profile, sendConnectedTransaction, status, verifySession]);

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
          landingHeader: `进入 ${BRAND.platform.name}`,
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
