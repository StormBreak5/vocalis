import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertPortAvailable,
  buildControlledEnvironment,
  validateLocalSupabaseStatus,
} from '../e2e/local-environment.mjs';
import {
  ensureDockerAvailable,
  projectRoot,
  readLocalSupabaseStatus,
  runSupabaseCommand,
  SUPABASE_TEST_EXCLUDES,
} from '../supabase/local-cli.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const nextCli = resolve(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next');

function log(message) {
  process.stdout.write(`[app-local] ${message}\n`);
}

function parsePort(value) {
  const port = Number.parseInt(value ?? '3000', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('VOCALIS_APP_PORT deve ser uma porta válida entre 1 e 65535.');
  }
  return port;
}

export function createLocalProductionEnvironment(
  status,
  baseEnvironment = process.env,
  port = 3000,
) {
  validateLocalSupabaseStatus(status);
  const baseUrl = `http://127.0.0.1:${port}`;

  return buildControlledEnvironment(status, {
    ...baseEnvironment,
    HOSTNAME: '127.0.0.1',
    NEXT_TELEMETRY_DISABLED: '1',
    PORT: String(port),
    VOCALIS_E2E_BASE_URL: baseUrl,
    VOCALIS_LOCAL_PRODUCTION: '1',
  });
}

function endpoint(value) {
  const url = new URL(value);
  const hostname = url.hostname === '::1' ? '[::1]' : url.hostname;
  return `${hostname}:${url.port}`;
}

export function formatLocalStatus(status) {
  validateLocalSupabaseStatus(status);
  return `API ${endpoint(status.API_URL)} · PostgreSQL ${endpoint(status.DB_URL)}`;
}

function sensitiveValues(status) {
  return [
    status.ANON_KEY,
    status.SERVICE_ROLE_KEY,
    status.JWT_SECRET,
    status.DB_URL,
  ].filter(Boolean).sort((left, right) => right.length - left.length);
}

export function sanitizeProcessOutput(value, status) {
  return sensitiveValues(status).reduce(
    (sanitized, secret) => sanitized.split(secret).join('[redacted]'),
    String(value),
  );
}

function forwardSanitizedLines(stream, output, status) {
  if (!stream) return;
  const lines = createInterface({ input: stream });
  lines.on('line', (line) => {
    output.write(`${sanitizeProcessOutput(line, status)}\n`);
  });
}

function waitForExit(child) {
  return new Promise((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('exit', (code, signal) => resolveExit({ code, signal }));
  });
}

function spawnOwned(entrypoint, args, environment, status) {
  const child = spawn(process.execPath, [entrypoint, ...args], {
    cwd: projectRoot,
    env: environment,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  forwardSanitizedLines(child.stdout, process.stdout, status);
  forwardSanitizedLines(child.stderr, process.stderr, status);
  return child;
}

async function defaultRunBuild({ environment, status, ownedProcesses }) {
  const child = spawnOwned(nextCli, ['build'], environment, status);
  ownedProcesses.add(child);
  const result = await waitForExit(child);
  ownedProcesses.delete(child);
  if (result.code !== 0) {
    throw new Error(`Build de produção falhou com código ${result.code ?? result.signal}.`);
  }
}

function defaultStartServer({ environment, status, port, ownedProcesses }) {
  const child = spawnOwned(
    nextCli,
    ['start', '-H', '127.0.0.1', '-p', String(port)],
    environment,
    status,
  );
  ownedProcesses.add(child);
  return child;
}

async function defaultWaitForServer(baseUrl) {
  let lastError;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      const response = await fetch(baseUrl, {
        signal: AbortSignal.timeout(1_500),
      });
      if (response.ok) return;
      lastError = new Error(`resposta HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
  }
  throw new Error(`Next local não ficou pronto: ${lastError?.message ?? 'erro desconhecido'}.`);
}

export async function ensureLocalSupabase({
  ensureDocker = ensureDockerAvailable,
  readStatus = readLocalSupabaseStatus,
  startSupabase = runSupabaseCommand,
  logger = log,
} = {}) {
  await ensureDocker();
  let status = await readStatus({ allowUnavailable: true });

  if (!status) {
    logger('Supabase local indisponível; iniciando serviços locais sem resetar dados.');
    await startSupabase(
      ['start', '--exclude', SUPABASE_TEST_EXCLUDES],
      'Falha ao iniciar o Supabase local.',
    );
    status = await readStatus();
  }

  validateLocalSupabaseStatus(status);
  return status;
}

export async function launchLocalProduction({
  status,
  port = 3000,
  baseEnvironment = process.env,
  ownedProcesses = new Set(),
  assertPort = assertPortAvailable,
  runBuild = defaultRunBuild,
  startServer = defaultStartServer,
  waitForServer = defaultWaitForServer,
} = {}) {
  validateLocalSupabaseStatus(status);
  await assertPort(port);

  const environment = createLocalProductionEnvironment(
    status,
    baseEnvironment,
    port,
  );
  const baseUrl = `http://127.0.0.1:${port}`;

  await runBuild({ environment, status, port, ownedProcesses });
  await assertPort(port);
  const server = startServer({ environment, status, port, ownedProcesses });

  try {
    await waitForServer(baseUrl);
  } catch (error) {
    await stopOwnedProcess(server);
    ownedProcesses.delete(server);
    throw error;
  }

  return { baseUrl, environment, server };
}

export async function stopOwnedProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;

  const exited = new Promise((resolveExit) => child.once('exit', resolveExit));
  child.kill('SIGTERM');
  const stopped = await Promise.race([
    exited.then(() => true),
    new Promise((resolveDelay) => setTimeout(() => resolveDelay(false), 5_000)),
  ]);

  if (!stopped && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await exited;
  }
}

export async function stopOwnedProcesses(ownedProcesses) {
  const processes = [...ownedProcesses];
  await Promise.all(processes.map((child) => stopOwnedProcess(child)));
  for (const child of processes) ownedProcesses.delete(child);
}

async function main() {
  if (!existsSync(nextCli)) {
    throw new Error('Next CLI não encontrada. Execute npm ci.');
  }

  const port = parsePort(process.env.VOCALIS_APP_PORT);
  const checkOnly = process.argv.slice(2).includes('--check');
  const ownedProcesses = new Set();
  let shuttingDown = false;

  const shutdown = async (exitCode) => {
    if (shuttingDown) return;
    shuttingDown = true;
    await stopOwnedProcesses(ownedProcesses);
    process.exitCode = exitCode;
  };

  process.once('SIGINT', () => void shutdown(130));
  process.once('SIGTERM', () => void shutdown(143));

  try {
    const status = await ensureLocalSupabase();
    log(`Supabase local validado: ${formatLocalStatus(status)}.`);
    log('Criando build com o ambiente local validado; .env.local será sobrescrito nos processos filhos.');

    const { baseUrl, server } = await launchLocalProduction({
      status,
      port,
      ownedProcesses,
    });
    log(`Servidor pronto em ${baseUrl}. Pressione Ctrl+C para encerrar.`);

    if (checkOnly) {
      log('Validação concluída; encerrando os processos locais iniciados pelo executor.');
      return;
    }

    const result = await waitForExit(server);
    ownedProcesses.delete(server);
    if (!shuttingDown && result.code !== 0) {
      throw new Error(`Servidor Next encerrou com código ${result.code ?? result.signal}.`);
    }
  } finally {
    await shutdown(process.exitCode ?? 0);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === resolve(scriptPath)) {
  main().catch((error) => {
    process.stderr.write(`[app-local] ${error.message}\n`);
    process.exitCode = 1;
  });
}
