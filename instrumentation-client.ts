import * as Sentry from '@sentry/nextjs';

const dsn =
  process.env.NEXT_PUBLIC_SENTRY_DSN ??
  'https://beab6d27d10e311fd960bda66500c737@o4511991720902656.ingest.us.sentry.io/4511991739514880';

Sentry.init({
  dsn,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  // Session Replay desligado: dados de participantes em bar + custo.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  ignoreErrors: ['AbortError', 'TypeError: Failed to fetch', 'NetworkError'],
  enabled:
    process.env.NODE_ENV === 'production' &&
    process.env.NEXT_PUBLIC_VOCALIS_LOCAL_PRODUCTION !== '1',
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
