import {
  ensureDockerAvailable,
  readLocalSupabaseStatus,
  runSupabaseCommand,
  SUPABASE_TEST_EXCLUDES,
} from './local-cli.mjs';

async function prepare() {
  await ensureDockerAvailable();
  const running = await readLocalSupabaseStatus({ allowUnavailable: true });
  if (!running) {
    process.stdout.write('[supabase-local] Iniciando serviços locais.\n');
    await runSupabaseCommand(
      ['start', '--exclude', SUPABASE_TEST_EXCLUDES],
      'Falha ao iniciar o Supabase local.',
    );
  }

  process.stdout.write('[supabase-local] Resetando o banco local.\n');
  await runSupabaseCommand(
    ['db', 'reset'],
    'Falha ao resetar o banco Supabase local.',
  );
  await readLocalSupabaseStatus();
  process.stdout.write('[supabase-local] Ambiente local validado.\n');
}

async function stop() {
  await runSupabaseCommand(
    ['stop', '--no-backup'],
    'Falha ao encerrar os recursos do Supabase local.',
  );
  process.stdout.write('[supabase-local] Recursos locais encerrados.\n');
}

const operation = process.argv[2];
const task = operation === 'prepare' ? prepare : operation === 'stop' ? stop : null;

if (!task) {
  process.stderr.write('Uso: node manage-local.mjs <prepare|stop>\n');
  process.exitCode = 1;
} else {
  task().catch((error) => {
    process.stderr.write(`[supabase-local] ${error.message}\n`);
    process.exitCode = 1;
  });
}
