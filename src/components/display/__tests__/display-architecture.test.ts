// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const displayDirectory = join(process.cwd(), 'src', 'components', 'display');

function productiveDisplayFiles(): string[] {
  return readdirSync(displayDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => join(displayDirectory, entry.name));
}

// O telão é somente leitura por desenho, com exatamente uma exceção
// deliberada: resgatar um código de pareamento (FR-006). Essa action só cria
// a própria linha de display_pairings do chamador para a sessão da URL —
// nunca toca sessions/participants/queue — e a RPC que ela chama já é
// provada bloqueada para escrita em qualquer outra tabela (SC-003). Qualquer
// outro import de /application/ continua banido.
const ALLOWED_APPLICATION_IMPORTS = new Set([
  '@/src/application/display-pairing/redeem-display-pairing-code.action',
]);

describe('display architecture', () => {
  it('não alcança ações, controles administrativos ou implementações de mutação', () => {
    for (const file of productiveDisplayFiles()) {
      const source = readFileSync(file, 'utf8');
      const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)]
        .map((match) => match[1]);

      const applicationImports = imports.filter(
        (imp) => imp.includes('/application/') && !ALLOWED_APPLICATION_IMPORTS.has(imp),
      );
      expect(applicationImports, file).toEqual([]);
      expect(imports, file).not.toContainEqual(expect.stringContaining('/components/dj/'));
      expect(imports, file).not.toContainEqual(expect.stringMatching(/(?:update|close|cancel|request)-.*\.action/));
      expect(source, file).not.toContain('dangerouslySetInnerHTML');
      expect(source, file).not.toMatch(/['"]use server['"]/);
    }
  });

  it('mantém o encoder QR fora do grafo dos componentes do telão', () => {
    for (const file of productiveDisplayFiles()) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toContain('room-entry-qr.server');
      expect(source, file).not.toMatch(/from\s+['"]qr['"]/);
    }

    const route = readFileSync(
      join(process.cwd(), 'app', 'sala', '[code]', 'display', 'page.tsx'),
      'utf8',
    );
    expect(route).toContain('generateRoomEntryQr');
    expect(route).toContain('room-entry-qr.server');
  });
});
