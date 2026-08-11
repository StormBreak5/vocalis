export type AppPublicUrlConfig =
  | { status: 'missing' }
  | { status: 'configured'; baseUrl: string };

export type AppRuntime = 'development' | 'test' | 'production';

export interface AppPublicUrlOptions {
  runtime?: AppRuntime;
  controlledTestEnvironment?: boolean;
}

export class AppPublicUrlConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppPublicUrlConfigurationError';
  }
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === '::1'
    || normalized.startsWith('::ffff:127.')
    || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

function invalidConfiguration(): never {
  throw new AppPublicUrlConfigurationError(
    'APP_PUBLIC_URL inválida. Use uma URL absoluta http/https sem credenciais, query ou fragmento.',
  );
}

export function resolveAppPublicUrl(
  rawValue: string | undefined,
  options: AppPublicUrlOptions = {},
): AppPublicUrlConfig {
  if (rawValue === undefined || rawValue.trim() === '') {
    return { status: 'missing' };
  }

  const value = rawValue.trim();
  if (value.includes('?') || value.includes('#')) invalidConfiguration();

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return invalidConfiguration();
  }

  if (
    !['http:', 'https:'].includes(parsed.protocol)
    || parsed.origin === 'null'
    || parsed.username !== ''
    || parsed.password !== ''
    || parsed.search !== ''
    || parsed.hash !== ''
  ) {
    return invalidConfiguration();
  }

  const runtime = options.runtime ?? 'development';
  const loopbackAllowed = runtime !== 'production'
    || options.controlledTestEnvironment === true;
  if (isLoopbackHostname(parsed.hostname) && !loopbackAllowed) {
    throw new AppPublicUrlConfigurationError(
      'APP_PUBLIC_URL não pode usar endereço de loopback em produção.',
    );
  }

  const normalizedPath = parsed.pathname === '/'
    ? ''
    : parsed.pathname.replace(/\/+$/, '');

  return {
    status: 'configured',
    baseUrl: parsed.origin + normalizedPath,
  };
}
