// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { assertLoopbackDatabaseUrl } from './postgres-race-harness';

describe('postgres race harness bootstrap', () => {
  it.each(['postgresql://postgres:postgres@127.0.0.1:54322/postgres','postgres://postgres:postgres@localhost:54322/postgres'])('aceita somente PostgreSQL loopback: %s', (url) => {
    expect(assertLoopbackDatabaseUrl(url).hostname).toMatch(/localhost|127\.0\.0\.1/);
  });

  it.each(['postgresql://example.com/postgres','https://127.0.0.1:54322/postgres'])('rejeita destino inseguro: %s', (url) => {
    expect(() => assertLoopbackDatabaseUrl(url)).toThrow();
  });
});
