import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { Bitmap } from 'qr';
import decodeQR from 'qr/decode.js';
import { generateRoomEntryQr } from '@/src/infrastructure/qr/room-entry-qr.server';

function decodeGeneratedSvg(svg: string): { text: string; quietZone: number } {
  const viewBox = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  const path = svg.match(/<path d="([^"]+)"/);
  if (!viewBox || !path) throw new Error('SVG de teste sem viewBox ou modulos.');

  const width = Number(viewBox[1]);
  const height = Number(viewBox[2]);
  const modules = Array.from({ length: height }, () => Array<boolean>(width).fill(false));
  const cell = /([Mm])(-?\d+) (-?\d+)h1v1(?:H-?\d+|h-1)Z/g;
  let currentX = 0;
  let currentY = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let match: RegExpExecArray | null;

  while ((match = cell.exec(path[1])) !== null) {
    const nextX = Number(match[2]);
    const nextY = Number(match[3]);
    if (match[1] === 'M') {
      currentX = nextX;
      currentY = nextY;
    } else {
      currentX += nextX;
      currentY += nextY;
    }
    modules[currentY][currentX] = true;
    minX = Math.min(minX, currentX);
    minY = Math.min(minY, currentY);
    maxX = Math.max(maxX, currentX);
    maxY = Math.max(maxY, currentY);
  }

  if (maxX < 0) throw new Error('SVG de teste sem modulos escuros.');
  const bitmap = new Bitmap({ width, height }, modules).scale(4);
  return {
    text: decodeQR(bitmap.toImage()),
    quietZone: Math.min(minX, minY, width - maxX - 1, height - maxY - 1),
  };
}

function generateWithOrigin(code: string, origin: string) {
  vi.stubEnv('APP_PUBLIC_URL', origin);
  return generateRoomEntryQr(code);
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const entry = join(directory, name);
    if (['node_modules', '.next', '.git'].includes(name)) return [];
    if (statSync(entry).isDirectory()) return sourceFiles(entry);
    return /\.(?:ts|tsx|mts)$/.test(name) ? [entry] : [];
  });
}

describe('createRoomEntryQr', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['https://vocalis.example.test', 'https://vocalis.example.test/entrar?codigo=ABC234'],
    ['https://vocalis.example.test/', 'https://vocalis.example.test/entrar?codigo=ABC234'],
    ['https://vocalis.example.test/karaoke/', 'https://vocalis.example.test/karaoke/entrar?codigo=ABC234'],
  ])('gera e decodifica a URL exata preservando a base: %s', (origin, expected) => {
    const result = generateWithOrigin('abc234', origin);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('QR deveria estar configurado.');

    expect(result.entryUrl).toBe(expected);
    expect(decodeGeneratedSvg(result.svg)).toEqual({ text: expected, quietZone: 4 });
    expect(result.svg).toContain('fill="#ffffff"');
    expect(result.svg).toContain('fill="#000000"');
    expect(result.svgDataUrl).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
  });

  it('retorna estado explicito quando a origem nao esta configurada', () => {
    vi.stubEnv('APP_PUBLIC_URL', '');
    expect(generateRoomEntryQr('ABC234')).toEqual({
      status: 'origin-not-configured',
    });
  });

  it('nao inclui rotas administrativas, tokens ou credenciais no resultado', () => {
    const result = generateWithOrigin(
      'A2B3C4',
      'https://vocalis.example.test/base',
    );
    const serialized = JSON.stringify(result).toLowerCase();

    expect(serialized).not.toContain('/dj');
    expect(serialized).not.toContain('/display');
    expect(serialized).not.toContain('jwt');
    expect(serialized).not.toContain('supabase');
    expect(serialized).not.toContain('service_role');
  });

  it.each(['ABC', 'ABC!23', 'ABC 23', ''])('rejeita codigo de sala invalido: %s', code => {
    expect(() => generateWithOrigin(code, 'https://vocalis.example.test'))
      .toThrow('Código de sala inválido');
  });

  it('mantem imports produtivos de qr restritos a implementacao server-only', () => {
    const root = resolve(process.cwd());
    const imports = sourceFiles(root)
      .filter((file) => /(?:from\s+|import\s*)['"]qr(?:\/[^'"]+)?['"]/.test(
        readFileSync(file, 'utf8'),
      ))
      .map((file) => relative(root, file).replaceAll('\\', '/'))
      .sort();

    const productionImports = imports.filter((file) => !file.includes('__tests__'));
    expect(productionImports).toEqual([
      'src/infrastructure/qr/room-entry-qr.server.ts',
    ]);
    expect(imports).toContain('src/infrastructure/__tests__/room-entry-qr.test.ts');
  });
});
