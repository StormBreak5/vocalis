import { createHash } from 'node:crypto';
import { createServer } from 'node:net';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const REQUIRED_STATUS_KEYS = [
  'ANON_KEY',
  'API_URL',
  'DB_URL',
  'FUNCTIONS_URL',
  'GRAPHQL_URL',
  'JWT_SECRET',
  'REST_URL',
  'SERVICE_ROLE_KEY',
];

function normalizeHostname(hostname) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '');
}

export function isLoopbackUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;

  try {
    const url = new URL(value);
    return LOOPBACK_HOSTS.has(normalizeHostname(url.hostname));
  } catch {
    return false;
  }
}

export function assertLoopbackUrl(name, value) {
  if (!value) throw new Error(`${name} não definida.`);
  if (!isLoopbackUrl(value)) {
    throw new Error(`${name} deve apontar exclusivamente para loopback local.`);
  }
  if (value.toLowerCase().includes('supabase.co')) {
    throw new Error(`${name} não pode apontar para supabase.co.`);
  }
  return new URL(value);
}

function decodeJwtPayload(name, token, expectedRole) {
  if (!token) throw new Error(`${name} não definida.`);

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error(`${name} não é um JWT local válido.`);

  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error(`${name} não é um JWT local válido.`);
  }

  if (payload.iss !== 'supabase-demo' || payload.role !== expectedRole) {
    throw new Error(`${name} não corresponde às credenciais do Supabase local.`);
  }
}

export function parseSupabaseEnvOutput(output) {
  const parsed = {};

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        value = JSON.parse(value);
      } catch {
        throw new Error(`Saída inválida da Supabase CLI para ${key}.`);
      }
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }

  return parsed;
}

export function validateLocalSupabaseStatus(status) {
  for (const key of REQUIRED_STATUS_KEYS) {
    if (!status[key]) throw new Error(`Supabase local não forneceu ${key}.`);
  }

  for (const [key, value] of Object.entries(status)) {
    if (key.endsWith('_URL')) assertLoopbackUrl(key, value);
  }

  const apiUrl = assertLoopbackUrl('API_URL', status.API_URL);
  const restUrl = assertLoopbackUrl('REST_URL', status.REST_URL);
  const functionsUrl = assertLoopbackUrl('FUNCTIONS_URL', status.FUNCTIONS_URL);
  const graphqlUrl = assertLoopbackUrl('GRAPHQL_URL', status.GRAPHQL_URL);
  assertLoopbackUrl('DB_URL', status.DB_URL);

  for (const [name, url] of [
    ['REST_URL', restUrl],
    ['FUNCTIONS_URL', functionsUrl],
    ['GRAPHQL_URL', graphqlUrl],
  ]) {
    if (url.origin !== apiUrl.origin) {
      throw new Error(`${name} não pertence ao mesmo Supabase local de API_URL.`);
    }
  }

  decodeJwtPayload('ANON_KEY', status.ANON_KEY, 'anon');
  decodeJwtPayload('SERVICE_ROLE_KEY', status.SERVICE_ROLE_KEY, 'service_role');

  return status;
}

function environmentFingerprint(status) {
  return createHash('sha256')
    .update(
      [
        status.API_URL,
        status.DB_URL,
        status.ANON_KEY,
        status.SERVICE_ROLE_KEY,
        status.JWT_SECRET,
      ].join('\0'),
    )
    .digest('hex');
}

export function buildControlledEnvironment(status, baseEnvironment = process.env) {
  validateLocalSupabaseStatus(status);

  const controlled = {
    ...baseEnvironment,
    VOCALIS_E2E_CONTROLLED: '1',
    VOCALIS_E2E_ENV_FINGERPRINT: environmentFingerprint(status),
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  };

  for (const key of REQUIRED_STATUS_KEYS) {
    controlled[`VOCALIS_E2E_${key}`] = status[key];
  }

  return controlled;
}

export function assertPlaywrightEnvironment(environment = process.env) {
  if (environment.VOCALIS_E2E_CONTROLLED !== '1') {
    throw new Error(
      'Playwright bloqueado: use um script test:e2e:* para preparar o Supabase local.',
    );
  }

  const status = Object.fromEntries(
    REQUIRED_STATUS_KEYS.map((key) => [key, environment[`VOCALIS_E2E_${key}`]]),
  );
  validateLocalSupabaseStatus(status);

  if (environment.NEXT_PUBLIC_SUPABASE_URL !== status.API_URL) {
    throw new Error('Credenciais misturadas: URL pública difere do Supabase local validado.');
  }
  if (environment.NEXT_PUBLIC_SUPABASE_ANON_KEY !== status.ANON_KEY) {
    throw new Error('Credenciais misturadas: anon key difere do Supabase local validado.');
  }
  if (environment.VOCALIS_E2E_ENV_FINGERPRINT !== environmentFingerprint(status)) {
    throw new Error('Credenciais misturadas: assinatura do ambiente local é inválida.');
  }

  const baseUrl = environment.VOCALIS_E2E_BASE_URL;
  assertLoopbackUrl('VOCALIS_E2E_BASE_URL', baseUrl);

  return { baseUrl, status };
}

export async function assertPortAvailable(port, host = '127.0.0.1') {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once('error', (error) => {
      if (error && error.code === 'EADDRINUSE') {
        reject(
          new Error(
            `Porta ${port} ocupada em ${host}; nenhum processo foi encerrado.`,
          ),
        );
        return;
      }
      reject(error);
    });
    probe.listen({ host, port, exclusive: true }, () => {
      probe.close((error) => (error ? reject(error) : resolve()));
    });
  });
}
