export interface SecurityHeader {
  key: string;
  value: string;
}

export interface SecurityHeadersOptions {
  /** Host do projeto Supabase (ex.: `hqeslozcyurjcgmaiikh.supabase.co`). */
  supabaseHost?: string;
  /** `true` libera `'unsafe-eval'` no `script-src` (necessário só no dev do Next). */
  isDev?: boolean;
  /**
   * `true` entrega a CSP como `Content-Security-Policy-Report-Only` (não bloqueia,
   * só reporta). Use na primeira subida e troque para enforce depois de validar.
   */
  reportOnly?: boolean;
}

/**
 * Extrai o host de uma URL de Supabase. Retorna `undefined` se a URL for
 * inválida ou loopback (dev local) — nesses casos a CSP cai só para `'self'`
 * no `connect-src`, o que é aceitável fora de produção.
 */
export function supabaseHostFromUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;
  try {
    const { hostname } = new URL(rawUrl);
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return undefined;
    }
    return hostname;
  } catch {
    return undefined;
  }
}

function buildContentSecurityPolicy(options: SecurityHeadersOptions): string {
  const { supabaseHost, isDev } = options;

  const supabaseHttp = supabaseHost ? `https://${supabaseHost}` : '';
  const supabaseWs = supabaseHost ? `wss://${supabaseHost}` : '';

  // Sentry vai pelo tunnelRoute (/monitoring, mesma origem), então não precisa
  // de host externo aqui.
  const connectSrc = ["'self'", supabaseHttp, supabaseWs].filter(Boolean);

  const scriptSrc = ["'self'", "'unsafe-inline'"];
  if (isDev) scriptSrc.push("'unsafe-eval'");

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': scriptSrc,
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],
    'connect-src': connectSrc,
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'object-src': ["'none'"],
  };

  return Object.entries(directives)
    .map(([directive, values]) => `${directive} ${values.join(' ')}`)
    .join('; ');
}

/**
 * Headers de segurança aplicados a todas as respostas via `next.config.ts`.
 */
export function buildSecurityHeaders(options: SecurityHeadersOptions = {}): SecurityHeader[] {
  const cspKey = options.reportOnly
    ? 'Content-Security-Policy-Report-Only'
    : 'Content-Security-Policy';

  return [
    {
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload',
    },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
    },
    { key: cspKey, value: buildContentSecurityPolicy(options) },
  ];
}
