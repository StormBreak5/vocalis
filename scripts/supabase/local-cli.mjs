import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseSupabaseEnvOutput,
  validateLocalSupabaseStatus,
} from '../e2e/local-environment.mjs';

const EXPECTED_SUPABASE_VERSION = '2.111.0';
export const SUPABASE_TEST_EXCLUDES =
  'storage-api,imgproxy,mailpit,postgres-meta,studio,logflare,vector,supavisor';
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
export const projectRoot = resolve(scriptDirectory, '..', '..');
export const supabaseCli = resolve(
  projectRoot,
  'node_modules',
  'supabase',
  'dist',
  'supabase.js',
);

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
    child.once('exit', (code, signal) =>
      resolve({ code, signal, stdout, stderr }),
    );
  });
}

export function assertSupabaseCliVersion() {
  if (!existsSync(supabaseCli)) {
    throw new Error('Supabase CLI não encontrada. Execute npm ci.');
  }

  const packagePath = resolve(
    projectRoot,
    'node_modules',
    'supabase',
    'package.json',
  );
  const installed = JSON.parse(readFileSync(packagePath, 'utf8')).version;
  if (installed !== EXPECTED_SUPABASE_VERSION) {
    throw new Error(
      `Supabase CLI deve ser ${EXPECTED_SUPABASE_VERSION}; encontrada ${installed}.`,
    );
  }
}

export async function ensureDockerAvailable() {
  const result = await capture('docker', [
    'info',
    '--format',
    '{{json .ServerVersion}}',
  ]);
  if (result.code !== 0) {
    throw new Error('Docker indisponível para o Supabase local.');
  }
}

export async function readLocalSupabaseStatus({ allowUnavailable = false } = {}) {
  assertSupabaseCliVersion();
  const result = await capture(process.execPath, [
    supabaseCli,
    'status',
    '-o',
    'env',
  ]);
  if (result.code !== 0) {
    if (allowUnavailable) return null;
    throw new Error('Supabase local indisponível.');
  }

  try {
    return validateLocalSupabaseStatus(parseSupabaseEnvOutput(result.stdout));
  } catch (error) {
    // A CLI respondeu, mas o ambiente veio incompleto — tipicamente uma stack
    // local meio de pé, sobrevivente de uma execução anterior interrompida.
    // Quem passa `allowUnavailable` está perguntando "dá para usar como está?";
    // um ambiente parcial não serve, e a resposta correta é `null` (recriar),
    // não uma exceção. Sem isso, o `prepare` morre em vez de se recuperar —
    // falha que a CI nunca reproduz, porque lá a stack sempre começa do zero.
    if (allowUnavailable) return null;
    throw error;
  }
}

export async function runSupabaseCommand(
  args,
  failureMessage,
  { allowFailure = false } = {},
) {
  assertSupabaseCliVersion();
  const result = await capture(process.execPath, [supabaseCli, ...args]);
  if (result.code !== 0 && !allowFailure) throw new Error(failureMessage);
  return result.code === 0;
}

export async function runNodeProcess(entrypoint, args, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entrypoint, ...args], {
      cwd: projectRoot,
      env: environment,
      windowsHide: true,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Processo falhou com código ${code ?? signal}.`));
    });
  });
}
