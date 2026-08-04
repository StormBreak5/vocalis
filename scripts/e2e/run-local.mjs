import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import {
  assertPortAvailable,
  buildControlledEnvironment,
  parseSupabaseEnvOutput,
  validateLocalSupabaseStatus,
} from './local-environment.mjs';

const { Client: PostgresClient } = pg;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '..', '..');
const supabaseCli = resolve(projectRoot, 'node_modules', 'supabase', 'dist', 'supabase.js');
const nextCli = resolve(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
const playwrightCli = resolve(
  projectRoot,
  'node_modules',
  '@playwright',
  'test',
  'cli.js',
);

let nextServer;
let testProcess;
let shuttingDown = false;

function log(message) {
  process.stdout.write(`[e2e-local] ${message}\n`);
}

function assertExecutables() {
  for (const [name, path] of [
    ['Supabase CLI', supabaseCli],
    ['Next CLI', nextCli],
    ['Playwright CLI', playwrightCli],
  ]) {
    if (!existsSync(path)) {
      throw new Error(`${name} não encontrado. Execute npm ci antes do E2E.`);
    }
  }
}

function capture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: process.env,
      windowsHide: true,
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: process.env,
      windowsHide: true,
      stdio: 'inherit',
      ...options,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Comando falhou com código ${code ?? signal}.`));
    });
  });
}

async function ensureDocker() {
  const result = await capture('docker', ['info', '--format', '{{json .ServerVersion}}']);
  if (result.code !== 0) {
    throw new Error('Docker indisponível. Inicie o Docker antes do E2E local.');
  }
}

async function readSupabaseStatus() {
  const result = await capture(process.execPath, [supabaseCli, 'status', '-o', 'env']);
  if (result.code !== 0) return null;

  const status = parseSupabaseEnvOutput(result.stdout);
  try {
    return validateLocalSupabaseStatus(status);
  } catch {
    return null;
  }
}

async function runSupabaseCommand(args, failureMessage) {
  const result = await capture(process.execPath, [supabaseCli, ...args]);
  if (result.code !== 0) throw new Error(failureMessage);
}

async function prepareSupabase() {
  let status = await readSupabaseStatus();
  if (!status) {
    log('Supabase local não está pronto; iniciando serviços locais.');
    await runSupabaseCommand(
      ['start'],
      'Falha ao iniciar o Supabase local. Consulte os logs da Supabase CLI.',
    );
  }

  log('Resetando exclusivamente o banco Supabase local.');
  await runSupabaseCommand(
    ['db', 'reset'],
    'Falha ao resetar o banco Supabase local.',
  );

  status = await readSupabaseStatus();
  if (!status) throw new Error('Supabase local não forneceu um ambiente válido após o reset.');
  return status;
}

async function retry(label, operation, attempts = 12) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await operation();
      log(`${label}: pronto.`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const delay = Math.min(400 + attempt * 150, 1_500);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
    }
  }
  throw new Error(`${label} não ficou pronto: ${lastError?.message ?? 'erro desconhecido'}`);
}

async function fetchOk(url, headers = {}) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(2_500),
  });
  if (!response.ok) throw new Error(`resposta HTTP ${response.status}`);
}

async function checkPostgres(dbUrl) {
  const client = new PostgresClient({
    connectionString: dbUrl,
    connectionTimeoutMillis: 2_500,
  });
  try {
    await client.connect();
    await client.query('select 1 as ready');
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function checkRealtime(status) {
  const client = createClient(status.API_URL, status.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const channel = client.channel(`readiness-${process.pid}-${Date.now()}`);

  try {
    await new Promise((resolveSubscription, rejectSubscription) => {
      const timeout = setTimeout(
        () => rejectSubscription(new Error('assinatura Realtime expirou')),
        4_000,
      );
      channel.subscribe((subscriptionStatus) => {
        if (subscriptionStatus === 'SUBSCRIBED') {
          clearTimeout(timeout);
          resolveSubscription();
        } else if (
          subscriptionStatus === 'CHANNEL_ERROR' ||
          subscriptionStatus === 'TIMED_OUT'
        ) {
          clearTimeout(timeout);
          rejectSubscription(new Error(`Realtime retornou ${subscriptionStatus}`));
        }
      });
    });
  } finally {
    await client.removeChannel(channel).catch(() => undefined);
  }
}

async function checkApplicationOperation(status) {
  const supabase = createClient(status.API_URL, status.ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  let userId;
  let sessionId;

  try {
    const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
    if (authError || !authData.user) throw authError ?? new Error('Auth sem usuário.');
    userId = authData.user.id;

    const { data: session, error: rpcError } = await supabase.rpc('create_session', {
      p_host_id: userId,
    });
    if (rpcError || !session?.id) throw rpcError ?? new Error('RPC sem sessão.');
    sessionId = session.id;
  } finally {
    if (userId) {
      const client = new PostgresClient({
        connectionString: status.DB_URL,
        connectionTimeoutMillis: 2_500,
      });
      try {
        await client.connect();
        if (sessionId) await client.query('delete from public.sessions where id = $1', [sessionId]);
        await client.query('delete from auth.users where id = $1', [userId]);
      } finally {
        await client.end().catch(() => undefined);
      }
    }
  }
}

async function waitForSupabase(status) {
  const authHeaders = { apikey: status.ANON_KEY };
  await retry('Auth', () => fetchOk(`${status.API_URL}/auth/v1/health`, authHeaders));
  await retry('REST', () => fetchOk(`${status.REST_URL}/`, authHeaders));
  await retry('PostgreSQL', () => checkPostgres(status.DB_URL));
  await retry('Realtime', () => checkRealtime(status));
  await retry('Operação real create_session', () => checkApplicationOperation(status));
}

async function stopOwnedProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;

  const exited = new Promise((resolveExit) => child.once('exit', () => resolveExit(true)));
  child.kill('SIGTERM');
  const stopped = await Promise.race([
    exited,
    new Promise((resolveDelay) => setTimeout(() => resolveDelay(false), 5_000)),
  ]);

  if (!stopped && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await exited;
  }
}

async function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  await stopOwnedProcess(testProcess);
  await stopOwnedProcess(nextServer);
  process.exitCode = exitCode;
}

async function waitForNext(baseUrl) {
  await retry(
    'Next produção',
    async () => {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(2_500) });
      if (!response.ok) throw new Error(`resposta HTTP ${response.status}`);
    },
    15,
  );
}

function parseArguments() {
  const [mode = 'functional', ...playwrightArguments] = process.argv.slice(2);
  if (!['functional', 'performance'].includes(mode)) {
    throw new Error('Modo inválido. Use functional ou performance.');
  }
  return { mode, playwrightArguments };
}

async function main() {
  assertExecutables();
  const { mode, playwrightArguments } = parseArguments();
  const port = Number.parseInt(process.env.VOCALIS_E2E_PORT ?? '3000', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('VOCALIS_E2E_PORT inválida.');
  }

  await ensureDocker();
  await assertPortAvailable(port);
  const status = await prepareSupabase();
  await waitForSupabase(status);

  const baseUrl = `http://127.0.0.1:${port}`;
  const controlledEnvironment = buildControlledEnvironment(status, {
    ...process.env,
    VOCALIS_E2E_BASE_URL: baseUrl,
    PORT: String(port),
    NEXT_TELEMETRY_DISABLED: '1',
  });

  log('Criando build de produção com credenciais locais injetadas.');
  await run(process.execPath, [nextCli, 'build'], { env: controlledEnvironment });

  await assertPortAvailable(port);
  log(`Iniciando Next produção em ${baseUrl}.`);
  nextServer = spawn(
    process.execPath,
    [nextCli, 'start', '-H', '127.0.0.1', '-p', String(port)],
    {
      cwd: projectRoot,
      env: controlledEnvironment,
      windowsHide: true,
      stdio: 'inherit',
    },
  );
  nextServer.once('error', (error) => {
    process.stderr.write(`[e2e-local] Falha no servidor Next: ${error.message}\n`);
  });
  await waitForNext(baseUrl);

  const testArguments = ['test', '--workers=1', '--reporter=line'];
  if (mode === 'functional') testArguments.push('--grep-invert=@performance');
  else testArguments.push('--grep=@performance');
  if (
    mode === 'performance' &&
    !playwrightArguments.some((argument) => argument.startsWith('--project'))
  ) {
    testArguments.push('--project=Mobile Chrome');
  }
  testArguments.push(...playwrightArguments);

  log(`Executando suíte ${mode}.`);
  testProcess = spawn(process.execPath, [playwrightCli, ...testArguments], {
    cwd: projectRoot,
    env: controlledEnvironment,
    windowsHide: true,
    stdio: 'inherit',
  });
  const testExitCode = await new Promise((resolveExit, rejectExit) => {
    testProcess.once('error', rejectExit);
    testProcess.once('exit', (code) => resolveExit(code ?? 1));
  });
  await shutdown(testExitCode);
}

process.once('SIGINT', () => void shutdown(130));
process.once('SIGTERM', () => void shutdown(143));

main().catch(async (error) => {
  process.stderr.write(`[e2e-local] ${error.message}\n`);
  await shutdown(1);
});
