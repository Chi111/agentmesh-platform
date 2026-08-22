/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_PRIVY_APP_ID?: string;
  readonly VITE_PRIVY_CLIENT_ID?: string;
  readonly VITE_PRIVY_GOOGLE_ENABLED?: 'true' | 'false';
  readonly VITE_SETTLEMENT_MODE?: 'ledger' | 'contract';
  readonly VITE_BASE_CHAIN_ID?: string;
  readonly VITE_BASE_CHAIN_NAME?: string;
  readonly VITE_BASE_RPC_URL?: string;
  readonly VITE_ESCROW_CONTRACT_ADDRESS?: string;
  readonly VITE_MUSDC_ADDRESS?: string;
  readonly VITE_USDC_ADDRESS?: string;
  readonly VITE_USDC_DECIMALS?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
