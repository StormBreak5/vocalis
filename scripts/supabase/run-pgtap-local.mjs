import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { projectRoot, readLocalSupabaseStatus } from './local-cli.mjs';
import {
  collectPgtapFailures,
  pgtapFileLabel,
  resolveApprovedPgtapFiles,
} from './pgtap.mjs';

const { Client } = pg;

async function runFile(filePath, databaseUrl) {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
  });
  try {
    await client.connect();
    const sql = await readFile(filePath, 'utf8');
    const results = await client.query(sql);
    const failures = collectPgtapFailures(results);
    if (failures.length > 0) {
      throw new Error(failures.join(' | '));
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  const status = await readLocalSupabaseStatus();
  const files = resolveApprovedPgtapFiles(
    resolve(projectRoot, 'supabase', 'tests'),
  );

  for (const filePath of files) {
    const label = pgtapFileLabel(filePath);
    process.stdout.write(`[pgtap] Executando ${label}.\n`);
    try {
      await runFile(filePath, status.DB_URL);
    } catch (error) {
      throw new Error(`${label} falhou: ${error.message}`);
    }
  }

  process.stdout.write(`[pgtap] ${files.length} arquivos aprovados.\n`);
}

main().catch((error) => {
  process.stderr.write(`[pgtap] ${error.message}\n`);
  process.exitCode = 1;
});
