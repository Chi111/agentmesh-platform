export const privyAppId = import.meta.env.VITE_PRIVY_APP_ID?.trim();
export const privyClientId = import.meta.env.VITE_PRIVY_CLIENT_ID?.trim();
export const privyGoogleEnabled = import.meta.env.VITE_PRIVY_GOOGLE_ENABLED === 'true';

export const privyLoginMethods: Array<'email' | 'google' | 'wallet'> = privyGoogleEnabled
  ? ['email', 'google', 'wallet']
  : ['email', 'wallet'];
