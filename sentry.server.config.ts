import * as Sentry from '@sentry/nextjs';

// Sem DSN (dev, CI, preview sem env), o SDK se autodesativa — init é no-op.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  // Bares = internet ruim; não queremos ruído de rede como erro.
  ignoreErrors: ['AbortError', 'TypeError: Failed to fetch', 'NetworkError'],
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
});
