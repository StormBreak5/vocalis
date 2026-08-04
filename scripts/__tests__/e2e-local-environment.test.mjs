import { createServer } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertLoopbackUrl,
  assertPlaywrightEnvironment,
  assertPortAvailable,
  buildControlledEnvironment,
  validateLocalSupabaseStatus,
} from '../e2e/local-environment.mjs';

const openServers = [];

function jwt(role, issuer = 'supabase-demo') {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ iss: issuer, role })}.signature`;
}

function localStatus(overrides = {}) {
  return {
    ANON_KEY: jwt('anon'),
    API_URL: 'http://127.0.0.1:54321',
    DB_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    FUNCTIONS_URL: 'http://127.0.0.1:54321/functions/v1',
    GRAPHQL_URL: 'http://127.0.0.1:54321/graphql/v1',
    JWT_SECRET: 'local-secret',
    REST_URL: 'http://127.0.0.1:54321/rest/v1',
    SERVICE_ROLE_KEY: jwt('service_role'),
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    openServers.splice(0).map(
      (server) => new Promise((resolve) => server.close(resolve)),
    ),
  );
});

describe('proteção de ambiente E2E local', () => {
  it.each([
    'http://localhost:54321',
    'http://127.0.0.1:54321',
    'http://[::1]:54321',
  ])('aceita URL loopback %s', (url) => {
    expect(() => assertLoopbackUrl('TEST_URL', url)).not.toThrow();
  });

  it('rejeita URL supabase.co', () => {
    expect(() =>
      assertLoopbackUrl('API_URL', 'https://project.supabase.co'),
    ).toThrow(/loopback|supabase\.co/);
  });

  it('rejeita outro host remoto', () => {
    expect(() => assertLoopbackUrl('API_URL', 'https://example.com')).toThrow(
      /loopback/,
    );
  });

  it('rejeita variável ausente', () => {
    expect(() =>
      validateLocalSupabaseStatus(localStatus({ REST_URL: '' })),
    ).toThrow(/REST_URL/);
  });

  it('rejeita credenciais misturadas', () => {
    const controlled = buildControlledEnvironment(localStatus(), {
      VOCALIS_E2E_BASE_URL: 'http://127.0.0.1:3000',
    });
    controlled.NEXT_PUBLIC_SUPABASE_ANON_KEY = jwt('anon', 'supabase');
    expect(() => assertPlaywrightEnvironment(controlled)).toThrow(/misturadas/);
  });

  it('porta ocupada falha sem encerrar o processo alheio', async () => {
    const server = createServer();
    openServers.push(server);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    expect(address).not.toBeNull();

    await expect(assertPortAvailable(address.port)).rejects.toThrow(
      /nenhum processo foi encerrado/,
    );
    expect(server.listening).toBe(true);
  });
});
