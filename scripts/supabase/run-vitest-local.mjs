import { resolve } from 'node:path';
import {
  projectRoot,
  readLocalSupabaseStatus,
  runNodeProcess,
} from './local-cli.mjs';

const suites = {
  integration: [
    'src/infrastructure/__tests__/session-closure-preservation.integration.test.ts',
  ],
  race: [
    'src/infrastructure/__tests__/supabase/postgres-race-harness.test.ts',
    'src/infrastructure/__tests__/session-closure-concurrency.integration.test.ts',
  ],
};

async function main() {
  const suite = process.argv[2];
  const files = suites[suite];
  if (!files) throw new Error('Suíte inválida. Use integration ou race.');

  const status = await readLocalSupabaseStatus();
  const vitestCli = resolve(projectRoot, 'node_modules', 'vitest', 'vitest.mjs');
  await runNodeProcess(
    vitestCli,
    ['run', ...files],
    {
      ...process.env,
      RUN_SUPABASE_INTEGRATION: 'true',
      SUPABASE_TEST_DB_URL: status.DB_URL,
      NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    },
  );
}

main().catch((error) => {
  process.stderr.write(`[vitest-local] ${error.message}\n`);
  process.exitCode = 1;
});
