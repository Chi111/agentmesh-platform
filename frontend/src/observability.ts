type ProductProperties = Record<string, string | number | boolean | null | undefined>;

let posthogClient: typeof import('posthog-js').default | null = null;

export async function initializeObservability() {
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (sentryDsn) {
    const Sentry = await import('@sentry/react');
    Sentry.init({
      dsn: sentryDsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: Math.min(1, Math.max(0, Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.1))),
      sendDefaultPii: false,
      beforeSend(event) {
        if (event.request) event.request.headers = undefined;
        return event;
      },
    });
  }

  const posthogKey = import.meta.env.VITE_POSTHOG_KEY?.trim();
  if (posthogKey) {
    const { default: posthog } = await import('posthog-js');
    posthog.init(posthogKey, {
      api_host: import.meta.env.VITE_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com',
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: false,
      persistence: 'localStorage',
    });
    posthogClient = posthog;
  }
}

export function trackProductEvent(event: string, properties: ProductProperties = {}) {
  posthogClient?.capture(event, properties);
}
