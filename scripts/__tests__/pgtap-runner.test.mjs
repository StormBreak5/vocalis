import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  APPROVED_PGTAP_FILES,
  collectPgtapFailures,
  resolveApprovedPgtapFiles,
} from '../supabase/pgtap.mjs';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function approvedDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'vocalis-pgtap-'));
  temporaryDirectories.push(directory);
  await Promise.all(
    APPROVED_PGTAP_FILES.map((file) => writeFile(join(directory, file), 'select 1;')),
  );
  return directory;
}

describe('executor pgTAP determinístico', () => {
  it('mantém a ordem explícita dos arquivos aprovados', async () => {
    const directory = await approvedDirectory();
    expect(resolveApprovedPgtapFiles(directory).map((file) => file.split(/[\\/]/).at(-1)))
      .toEqual(APPROVED_PGTAP_FILES);
  });

  it('falha quando um arquivo esperado está ausente', async () => {
    const directory = await approvedDirectory();
    await rm(join(directory, APPROVED_PGTAP_FILES[0]));
    expect(() => resolveApprovedPgtapFiles(directory)).toThrow(/ausentes/);
  });

  it('identifica uma asserção pgTAP reprovada', () => {
    expect(
      collectPgtapFailures({ rows: [{ ok: 'not ok 2 - autorização' }] }),
    ).toEqual(['not ok 2 - autorização']);
  });
});
