import 'server-only';
import encodeQR from 'qr';
import { validateSessionCode } from '@/src/domain/validators/session-code.validator';
import { getAppPublicUrl } from '@/src/infrastructure/config/app-public-url.server';
import type { RoomEntryQrResult } from './room-entry-qr';

function buildRoomEntryUrl(baseUrl: string, code: string): string {
  const entryUrl = new URL(baseUrl + '/entrar');
  entryUrl.searchParams.set('codigo', code);
  return entryUrl.toString();
}

function addExplicitQrColors(svg: string): string {
  const openingEnd = svg.indexOf('>');
  const closingStart = svg.lastIndexOf('</svg>');
  if (openingEnd < 0 || closingStart < 0) {
    throw new Error('Falha ao gerar o QR Code da sala.');
  }

  const opening = svg
    .slice(0, openingEnd + 1)
    .replace('<svg ', '<svg shape-rendering="crispEdges" ');
  const modules = svg.slice(openingEnd + 1, closingStart);

  return opening
    + '<rect width="100%" height="100%" fill="#ffffff"/>'
    + '<g fill="#000000">'
    + modules
    + '</g></svg>';
}

export function generateRoomEntryQr(roomCode: string): RoomEntryQrResult {
  const publicUrl = getAppPublicUrl();
  if (publicUrl.status === 'missing') {
    return { status: 'origin-not-configured' };
  }

  let normalizedCode: string;
  try {
    normalizedCode = validateSessionCode(roomCode);
  } catch {
    throw new Error('Código de sala inválido para geração do QR Code.');
  }

  const entryUrl = buildRoomEntryUrl(publicUrl.baseUrl, normalizedCode);
  const svg = addExplicitQrColors(encodeQR(entryUrl, 'svg', {
    border: 4,
    ecc: 'medium',
    encoding: 'byte',
    optimize: true,
  }));

  return {
    status: 'ready',
    entryUrl,
    svg,
    svgDataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  };
}
