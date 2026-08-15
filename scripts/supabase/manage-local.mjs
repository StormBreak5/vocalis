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
    // `running === null` cobre dois casos: nada de pé (CI, máquina limpa) e
    // stack parcial (máquina de desenvolvimento com resquício de execução
    // anterior). O `stop` tolerante a falha uniformiza os dois — se não havia
    // nada rodando ele apenas não faz nada, e se havia algo pela metade ele
    // limpa antes do `start`, que não sobe sobre containers órfãos.
    process.stdout.write(
      '[supabase-local] Ambiente ausente ou incompleto. Recriando serviços locais.\n',
    );
    await runSupabaseCommand(['stop', '--no-backup'], null, {
      allowFailure: true,
    });
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
