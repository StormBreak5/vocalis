#!/usr/bin/env node
/**
 * Gera os assets de marca do Vocalis a partir do glifo (lucide `mic-vocal`, o
 * mesmo de VocalisBrand). Reexecutar sempre que a identidade visual mudar.
 *
 *   node scripts/assets/generate-pwa-icons.mjs
 *
 * Saídas:
 *   public/icons/icon-192.png            (purpose: any)
 *   public/icons/icon-512.png            (purpose: any)
 *   public/icons/icon-maskable-192.png   (purpose: maskable — glifo na safe zone)
 *   public/icons/icon-maskable-512.png
 *   app/apple-icon.png                   (180x180, usado pelo App Router)
 *   app/icon.svg                         (favicon do App Router)
 *   app/opengraph-image.png              (1200x630 — prévia de link WhatsApp/Slack/etc.)
 *   app/twitter-image.png                (mesma imagem, card do Twitter/X)
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

/**
 * Cartão social 1200x630 no visual "neon" das telas do produto:
 * fundo escuro azulado, brilhos violeta/magenta, badge da marca + wordmark.
 * Texto em stack sans genérica (Arial/Liberation Sans) — imagem é gerada uma
 * vez e commitada, então a fonte da máquina que roda o script não importa.
 */
function ogImageSvg() {
  const W = 1200;
  const H = 630;
  const badge = 208;
  const badgeX = 96;
  const badgeY = (H - badge) / 2;
  const glyphSize = Math.round(badge * 0.58);
  const glyphOffset = Math.round((badge - glyphSize) / 2);
  const textX = badgeX + badge + 64;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0a0b14"/>
      <stop offset="1" stop-color="#14121f"/>
    </linearGradient>
    <radialGradient id="glowViolet" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#8b5cf6" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowMagenta" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ec4faf" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#ec4faf" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="60"/>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <ellipse cx="180" cy="90" rx="360" ry="300" fill="url(#glowViolet)" filter="url(#soft)"/>
  <ellipse cx="1080" cy="560" rx="380" ry="300" fill="url(#glowMagenta)" filter="url(#soft)"/>

  <!-- badge da marca -->
  <rect x="${badgeX}" y="${badgeY}" width="${badge}" height="${badge}" rx="${Math.round(badge * 0.28)}"
        fill="#0b0c15" stroke="#8b5cf6" stroke-opacity="0.35" stroke-width="2"/>
  <g transform="translate(${badgeX + glyphOffset} ${badgeY + glyphOffset}) scale(${glyphSize / 24})"
     fill="none" stroke="${FG}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    ${GLYPH}
  </g>

  <!-- wordmark + tagline -->
  <text x="${textX}" y="322" font-family="Arial, 'Liberation Sans', 'Helvetica Neue', sans-serif"
        font-size="132" font-weight="800" letter-spacing="-4" fill="#f7f7fb">Vocalis</text>
  <rect x="${textX + 4}" y="352" width="118" height="8" rx="4" fill="#ec4faf"/>
  <text x="${textX}" y="418" font-family="Arial, 'Liberation Sans', 'Helvetica Neue', sans-serif"
        font-size="42" font-weight="400" fill="#b6b3d0">Sua fila de karaokê ao vivo</text>
</svg>`;
}

async function emitFromSvg(relPath, svg) {
  const out = resolve(root, relPath);
  await mkdir(dirname(out), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log('  ✓', relPath);
}

async function emitCopy(relPath, fromRelPath) {
  const out = resolve(root, relPath);
  await sharp(resolve(root, fromRelPath)).png().toFile(out);
  console.log('  ✓', relPath);
}

await emitFromSvg('public/icons/icon-192.png', iconSvg(192, 0.62));
await emitFromSvg('public/icons/icon-512.png', iconSvg(512, 0.62));
await emitFromSvg('public/icons/icon-maskable-192.png', maskableSvg(192));
await emitFromSvg('public/icons/icon-maskable-512.png', maskableSvg(512));
await emitFromSvg('app/apple-icon.png', iconSvg(180, 0.6));
await emitFromSvg('app/opengraph-image.png', ogImageSvg());
await emitCopy('app/twitter-image.png', 'app/opengraph-image.png');

// favicon do App Router (opcional, complementa app/favicon.ico existente)
await writeFile(
  resolve(root, 'app/icon.svg'),
  iconSvg(64, 0.66).replace(/\n\s*/g, ' ').trim() + '\n',
);
console.log('  ✓ app/icon.svg');
