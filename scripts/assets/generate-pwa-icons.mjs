#!/usr/bin/env node
/**
 * Gera os ícones do PWA a partir do glifo da marca (lucide `mic-vocal`, o mesmo
 * de VocalisBrand). Reexecutar sempre que a identidade visual mudar.
 *
 *   node scripts/assets/generate-pwa-icons.mjs
 *
 * Saídas:
 *   public/icons/icon-192.png            (purpose: any)
 *   public/icons/icon-512.png            (purpose: any)
 *   public/icons/icon-maskable-192.png   (purpose: maskable — glifo na safe zone)
 *   public/icons/icon-maskable-512.png
 *   app/apple-icon.png                   (180x180, usado pelo App Router)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BG = '#09090b';
const FG = '#fafafa';

// lucide mic-vocal (viewBox 24x24, stroke)
const GLYPH = `
  <path d="m11 7.601-5.994 8.19a1 1 0 0 0 .1 1.298l.817.818a1 1 0 0 0 1.314.087L15.09 12" />
  <path d="M16.5 21.174C15.5 20.5 14.372 20 13 20c-2.058 0-3.928 2.356-6 2-2.072-.356-2.775-3.369-1.5-4.5" />
  <circle cx="16" cy="7" r="5" />
`;

/** @param {number} size @param {number} glyphRatio fração do canvas ocupada pelo glifo */
function iconSvg(size, glyphRatio) {
  const glyphSize = Math.round(size * glyphRatio);
  const offset = Math.round((size - glyphSize) / 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="${BG}"/>
  <g transform="translate(${offset} ${offset}) scale(${glyphSize / 24})"
     fill="none" stroke="${FG}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    ${GLYPH}
  </g>
</svg>`;
}

function maskableSvg(size) {
  // full-bleed bg, glifo dentro da safe zone (~60%)
  const glyphSize = Math.round(size * 0.55);
  const offset = Math.round((size - glyphSize) / 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BG}"/>
  <g transform="translate(${offset} ${offset}) scale(${glyphSize / 24})"
     fill="none" stroke="${FG}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    ${GLYPH}
  </g>
</svg>`;
}

async function emit(relPath, svg) {
  const out = resolve(root, relPath);
  await mkdir(dirname(out), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log('  ✓', relPath);
}

await emit('public/icons/icon-192.png', iconSvg(192, 0.62));
await emit('public/icons/icon-512.png', iconSvg(512, 0.62));
await emit('public/icons/icon-maskable-192.png', maskableSvg(192));
await emit('public/icons/icon-maskable-512.png', maskableSvg(512));
await emit('app/apple-icon.png', iconSvg(180, 0.6));

// favicon do App Router (opcional, complementa app/favicon.ico existente)
await writeFile(
  resolve(root, 'app/icon.svg'),
  iconSvg(64, 0.66).replace(/\n\s*/g, ' ').trim() + '\n',
);
console.log('  ✓ app/icon.svg');
