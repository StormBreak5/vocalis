import { EventEmitter } from 'node:events';
import { createServer } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLocalProductionEnvironment,
  ensureLocalSupabase,
  formatLocalStatus,
  launchLocalProduction,
  sanitizeProcessOutput,
  stopOwnedProcesses,
} from '../app/run-local-production.mjs';

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
    JWT_SECRET: 'local-secret-value',
    REST_URL: 'http://127.0.0.1:54321/rest/v1',
    SERVICE_ROLE_KEY: jwt('service_role'),
    ...overrides,
  };
}

function fakeChild() {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = vi.fn((signal) => {
    child.signalCode = signal;
    queueMicrotask(() => child.emit('exit', null, signal));
    return true;
  });
  return child;
}

afterEach(async () => {
  await Promise.all(
    openServers.splice(0).map(
      (server) => new Promise((resolveClose) => server.close(resolveClose)),
    ),
  );
});

describe('executor de produção local seguro', () => {
  it('aceita ambiente local validado', () => {
    const environment = createLocalProductionEnvironment(localStatus(), {}, 3100);
    expect(environment.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
    expect(environment.PORT).toBe('3100');
  });

  it('rejeita URL remota', () => {
    expect(() =>
      createLocalProductionEnvironment(
        localStatus({ API_URL: 'https://project.supabase.co' }),
      ),
    ).toThrow(/loopback|supabase\.co/);
  });

  it('.env.local remoto não prevalece sobre credenciais locais injetadas', () => {
    const status = localStatus();
    const environment = createLocalProductionEnvironment(status, {
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'remote-key',
    });

    expect(environment.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
    expect(environment.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe(status.ANON_KEY);
    expect(JSON.stringify(environment)).not.toContain('project.supabase.co');
    expect(JSON.stringify(environment)).not.toContain('remote-key');
  });

  it('não inclui credenciais ou connection string na saída sanitizada', () => {
    const status = localStatus();
    const unsafe = `${status.ANON_KEY} ${status.SERVICE_ROLE_KEY} ${status.JWT_SECRET} ${status.DB_URL}`;
    const output = `${formatLocalStatus(status)} ${sanitizeProcessOutput(unsafe, status)}`;

    expect(output).toContain('127.0.0.1:54321');
    expect(output).toContain('127.0.0.1:54322');
    expect(output).not.toContain(status.ANON_KEY);
    expect(output).not.toContain(status.SERVICE_ROLE_KEY);
    expect(output).not.toContain(status.JWT_SECRET);
    expect(output).not.toContain(status.DB_URL);
  });

  it('inicia serviços locais sem executar db reset', async () => {
    const status = localStatus();
    const readStatus = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(status);
    const startSupabase = vi.fn().mockResolvedValue(undefined);

    await expect(
      ensureLocalSupabase({
        ensureDocker: vi.fn().mockResolvedValue(undefined),
        readStatus,
        startSupabase,
        logger: vi.fn(),
      }),
    ).resolves.toBe(status);

    expect(startSupabase).toHaveBeenCalledTimes(1);
    expect(startSupabase.mock.calls[0][0][0]).toBe('start');
    expect(startSupabase.mock.calls.flat().join(' ')).not.toContain('reset');
  });

  it('porta ocupada falha antes do build e não encerra o proprietário', async () => {
    const owner = createServer();
    openServers.push(owner);
    await new Promise((resolveListen) => owner.listen(0, '127.0.0.1', resolveListen));
    const address = owner.address();
    expect(address).not.toBeNull();
    const runBuild = vi.fn();

    await expect(
      launchLocalProduction({
        status: localStatus(),
        port: address.port,
        runBuild,
      }),
    ).rejects.toThrow(/nenhum processo foi encerrado/);

    expect(runBuild).not.toHaveBeenCalled();
    expect(owner.listening).toBe(true);
  });

  it('build e start recebem exatamente o mesmo ambiente validado', async () => {
    const environments = [];
    const server = fakeChild();
    const ownedProcesses = new Set();

    await launchLocalProduction({
      status: localStatus(),
      port: 3101,
      baseEnvironment: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      },
      ownedProcesses,
      assertPort: vi.fn().mockResolvedValue(undefined),
      runBuild: vi.fn(async ({ environment }) => environments.push(environment)),
      startServer: vi.fn(({ environment, ownedProcesses: owned }) => {
        environments.push(environment);
        owned.add(server);
        return server;
      }),
      waitForServer: vi.fn().mockResolvedValue(undefined),
    });

    expect(environments).toHaveLength(2);
    expect(environments[0]).toBe(environments[1]);
    expect(environments[0].NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
    expect(environments[0].NEXT_PUBLIC_SUPABASE_URL).not.toContain('supabase.co');
    await stopOwnedProcesses(ownedProcesses);
  });

  it('interrupção encerra somente processos registrados pelo executor', async () => {
    const build = fakeChild();
    const server = fakeChild();
    const unrelated = fakeChild();
    const ownedProcesses = new Set([build, server]);

    await stopOwnedProcesses(ownedProcesses);

    expect(build.kill).toHaveBeenCalledWith('SIGTERM');
    expect(server.kill).toHaveBeenCalledWith('SIGTERM');
    expect(unrelated.kill).not.toHaveBeenCalled();
    expect(ownedProcesses.size).toBe(0);
  });
});
