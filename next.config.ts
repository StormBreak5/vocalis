import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import {
  buildSecurityHeaders,
  supabaseHostFromUrl,
} from "./src/infrastructure/config/security-headers";

// CSP começa em modo Report-Only. Depois de validar no preview (sem violações
// no console / Sentry), troque para `false` e faça deploy — é a única mudança.
const CSP_REPORT_ONLY = true;

const securityHeaders = buildSecurityHeaders({
  supabaseHost: supabaseHostFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
  isDev: process.env.NODE_ENV === "development",
  reportOnly: CSP_REPORT_ONLY,
});

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Sem SENTRY_AUTH_TOKEN (CI, dev), o upload de source maps é pulado com aviso,
  // não falha o build.
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // Roteia os eventos do browser pelo próprio domínio, evitando bloqueio por
  // ad-blockers e simplificando a CSP (só precisa de 'self' no connect-src).
  tunnelRoute: "/monitoring",
});
