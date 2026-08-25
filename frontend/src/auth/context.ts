import { createContext } from 'react';
import type { SettlementRecipient } from '../services/settlement';
import type { YdWalletAction } from '../services/ydFinance';
import type { PaymentMethod, UserProfile } from '../types/domain';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'error';
export type AuthProviderName = 'pinme' | 'privy';

export interface AuthContextValue {
  status: AuthStatus;
  profile: UserProfile | null;
  error: string | null;
  provider: AuthProviderName;
  linkedWalletAddress: string | null;
  walletAddress: string | null;
  onchainSettlement: boolean;
  ydWalletEnabled: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithPrivy: () => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  linkWallet: () => Promise<void>;
  depositEscrow: (missionId: string, amount: number, paymentMethod: Extract<PaymentMethod, 'web3_musdc' | 'web3_seth'>, recipients: SettlementRecipient[]) => Promise<string | null>;
  releaseEscrow: (missionId: string, recipients: SettlementRecipient[]) => Promise<string | null>;
  freezeEscrow: (missionId: string) => Promise<string | null>;
  unfreezeEscrow: (missionId: string) => Promise<string | null>;
  refundEscrow: (missionId: string) => Promise<string | null>;
  submitYdAction: (action: YdWalletAction) => Promise<string>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<UserProfile | null>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function readableAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : '认证失败，请稍后重试。';
  if (message.includes('invalid-credential')) return '邮箱或密码不正确。';
  if (message.includes('popup-closed')) return '登录窗口已关闭。';
  if (message.includes('popup-blocked')) return '浏览器阻止了登录窗口，请允许弹窗后重试。';
  if (message.includes('access token')) return '登录会话已失效，请重新登录。';
  return message;
}
