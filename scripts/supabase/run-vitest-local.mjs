import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  projectRoot,
  readLocalSupabaseStatus,
  runNodeProcess,
} from './local-cli.mjs';

export const LOCAL_VITEST_SUITES = {
  integration: [
    'src/infrastructure/__tests__/session-closure-preservation.integration.test.ts',
    '__tests__/infrastructure/db/create_queue_entry.test.ts',
    '__tests__/infrastructure/db/cancel_queue_entry.test.ts',
  ],
  race: [
    'src/infrastructure/__tests__/supabase/postgres-race-harness.test.ts',
    'src/infrastructure/__tests__/session-closure-concurrency.integration.test.ts',
  ],
};

async function main() {
  const suite = process.argv[2];
  const files = LOCAL_VITEST_SUITES[suite];
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
      SUPABASE_URL: status.API_URL,
      SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    },
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`[vitest-local] ${error.message}\n`);
    process.exitCode = 1;
  });
}
