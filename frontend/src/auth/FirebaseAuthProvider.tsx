import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';
import { api, setApiTokenProvider } from '../services/api';
import type { UserProfile } from '../types/domain';
import { getProjectAuth } from './authClient';
import { type AuthContextValue, type AuthStatus, readableAuthError } from './context';

async function verifyFirebaseUser(user: User) {
  setApiTokenProvider(() => user.getIdToken());
  const { profile } = await api.verifySession(await user.getIdToken());
  return profile;
}

async function unavailableWallet(): Promise<never> {
  throw new Error('请配置 Privy 后使用钱包和链上托管。');
}

export function FirebaseAuthController({ onChange }: { onChange: (value: AuthContextValue) => void }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(getProjectAuth(), async (user) => {
    if (!user) {
      setApiTokenProvider(null);
      setProfile(null);
      setStatus('anonymous');
      setError(null);
      return;
    }
    try {
      setStatus('loading');
      setProfile(await verifyFirebaseUser(user));
      setStatus('authenticated');
      setError(null);
    } catch (authError) {
      setApiTokenProvider(null);
      setProfile(null);
      setStatus('error');
      setError(readableAuthError(authError));
    }
  }), []);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    profile,
    error,
    provider: 'pinme',
    linkedWalletAddress: null,
    walletAddress: null,
    onchainSettlement: false,
    loginWithEmail: async (email, password) => {
      setError(null);
      const credential = await signInWithEmailAndPassword(getProjectAuth(), email, password);
      setProfile(await verifyFirebaseUser(credential.user));
      setStatus('authenticated');
    },
    loginWithGoogle: async () => {
      setError(null);
      const credential = await signInWithPopup(getProjectAuth(), new GoogleAuthProvider());
      setProfile(await verifyFirebaseUser(credential.user));
      setStatus('authenticated');
    },
    loginWithPrivy: unavailableWallet,
    register: async (email, password, displayName) => {
      setError(null);
      await api.register({ email, password, displayName });
    },
    linkWallet: unavailableWallet,
    depositEscrow: unavailableWallet,
    releaseEscrow: unavailableWallet,
    freezeEscrow: unavailableWallet,
    unfreezeEscrow: unavailableWallet,
    refundEscrow: unavailableWallet,
    signOut: async () => {
      await firebaseSignOut(getProjectAuth());
      setApiTokenProvider(null);
      setProfile(null);
      setStatus('anonymous');
    },
    refreshProfile: async () => {
      const user = getProjectAuth().currentUser;
      if (!user) return null;
      const nextProfile = await verifyFirebaseUser(user);
      setProfile(nextProfile);
      return nextProfile;
    },
  }), [error, profile, status]);

  useEffect(() => onChange(value), [onChange, value]);

  return null;
}
