import 'server-only';
import {
  resolveAppPublicUrl,
  type AppPublicUrlConfig,
  type AppRuntime,
} from './app-public-url';

function runtimeFromEnvironment(value: string | undefined): AppRuntime {
  if (value === 'production' || value === 'test') return value;
  return 'development';
}

/**
 * Valor bruto da URL pública canônica.
 *
 * Preferência: `APP_PUBLIC_URL` explícita. Fallback: a URL de produção que a
 * Vercel injeta automaticamente (`VERCEL_PROJECT_PRODUCTION_URL`, sem esquema)
 * — isso faz preview deploys gerarem QR válido sem precisar configurar a env
 * var por deploy.
 */
function rawAppPublicUrl(): string | undefined {
  const explicit = process.env.APP_PUBLIC_URL;
  if (explicit && explicit.trim() !== '') return explicit;

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelHost && vercelHost.trim() !== '') return `https://${vercelHost.trim()}`;

  return undefined;
}

export function getAppPublicUrl(): AppPublicUrlConfig {
  return resolveAppPublicUrl(rawAppPublicUrl(), {
    runtime: runtimeFromEnvironment(process.env.NODE_ENV),
    controlledTestEnvironment: process.env.VOCALIS_E2E_CONTROLLED === '1',
  });
}

/**
 * Base absoluta para `metadata.metadataBase` do App Router. Nunca lança:
 * cai para `http://localhost:3000` quando nada está configurado (dev/CI build).
 */
export function getMetadataBaseUrl(): URL {
  const raw = rawAppPublicUrl();
  if (raw) {
    try {
      return new URL(raw);
    } catch {
      // ignora valor malformado e usa o fallback
    }
  }
  return new URL('http://localhost:3000');
}
