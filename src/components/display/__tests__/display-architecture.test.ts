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

describe('display architecture', () => {
  it('não alcança ações, controles administrativos ou implementações de mutação', () => {
    for (const file of productiveDisplayFiles()) {
      const source = readFileSync(file, 'utf8');
      const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)]
        .map((match) => match[1]);

      expect(imports, file).not.toContainEqual(expect.stringContaining('/application/'));
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
