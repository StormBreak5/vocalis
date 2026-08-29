import { existsSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';

export const APPROVED_PGTAP_FILES = Object.freeze([
  '003_close_session.sql',
  '003_participants_rls.sql',
  '003_queue_rls.sql',
  '003_session_closure_invariants.sql',
  '003_session_concurrency.sql',
  '003_session_privileges.sql',
  '003_session_writers.sql',
  '003_sessions_rls.sql',
  '004_display_pairing_codes.sql',
  '004_display_pairing_privileges.sql',
  '004_display_pairing_rls.sql',
  '004_list_active_queue.sql',
  '017_session_ownership_integrity.sql',
  '019_list_host_sessions.sql',
  '020_optional_song_and_edit.sql',
  '021_reorder_pending_queue.sql',
  '022_rate_limit_session_creation.sql',
]);

export function resolveApprovedPgtapFiles(testsDirectory) {
  const missing = APPROVED_PGTAP_FILES.filter(
    (file) => !existsSync(resolve(testsDirectory, file)),
  );
  if (missing.length > 0) {
    throw new Error(`Arquivos pgTAP esperados ausentes: ${missing.join(', ')}.`);
  }

  const discovered = readdirSync(testsDirectory)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  const unexpected = discovered.filter(
    (file) => !APPROVED_PGTAP_FILES.includes(file),
  );
  if (unexpected.length > 0) {
    throw new Error(
      `Arquivos pgTAP ainda não aprovados no executor: ${unexpected.join(', ')}.`,
    );
  }

  return APPROVED_PGTAP_FILES.map((file) => resolve(testsDirectory, file));
}

export function collectPgtapFailures(queryResults) {
  const results = Array.isArray(queryResults) ? queryResults : [queryResults];
  const failures = [];

  for (const result of results) {
    for (const row of result?.rows ?? []) {
      for (const value of Object.values(row)) {
        if (typeof value !== 'string') continue;
        const line = value.trim();
        if (
          /^(not ok\b|Bail out!)/i.test(line) ||
          /^# Looks like you (failed|planned)/i.test(line)
        ) {
          failures.push(line);
        }
      }
    }
  }

  return failures;
}

export function pgtapFileLabel(filePath) {
  return basename(filePath);
}
