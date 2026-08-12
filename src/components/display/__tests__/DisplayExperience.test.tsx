/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element, jsx-a11y/alt-text */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ActiveQueueEntry } from '@/src/domain/queue.types';
import type { RoomEntryQrResult } from '@/src/infrastructure/qr/room-entry-qr';
import { DisplayExperience } from '../DisplayExperience';
import { useActiveQueue } from '@/src/hooks/useActiveQueue';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';
import { useSessionLifecycleContext } from '@/src/components/session/SessionLifecycleProvider';

vi.mock('@/src/hooks/useActiveQueue', () => ({ useActiveQueue: vi.fn() }));
vi.mock('@/src/hooks/useOnlineStatus', () => ({ useOnlineStatus: vi.fn() }));
vi.mock('@/src/components/session/SessionLifecycleProvider', () => ({
  useSessionLifecycleContext: vi.fn(),
}));
vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const qr = {
  status: 'ready' as const,
  entryUrl: 'https://vocalis.example.test/entrar?codigo=ABC234',
  svg: '<svg />',
  svgDataUrl: 'data:image/svg+xml;charset=utf-8,%3Csvg%20%2F%3E',
};

function entry(overrides: Partial<ActiveQueueEntry> = {}): ActiveQueueEntry {
  return {
    id: 'queue-1',
    sessionId: SESSION_ID,
    participantId: 'participant-1',
    participantName: 'Marina',
    songTitle: 'Evidências',
    artist: 'Chitãozinho & Xororó',
    status: 'pending',
    position: 1,
    createdAt: '2026-08-11T20:00:00.000Z',
    updatedAt: '2026-08-11T20:00:00.000Z',
    ...overrides,
  };
}

let queue: ActiveQueueEntry[];
let online: boolean;
let queueOffline: boolean;
let phase: 'connected' | 'reconnecting' | 'offline' | 'closed';
let status: 'active' | 'paused' | 'closed';

function renderDisplay(qrResult: RoomEntryQrResult = qr) {
  return render(
    <DisplayExperience sessionId={SESSION_ID} code="ABC234" qr={qrResult} />,
  );
}

describe('DisplayExperience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1_920 });
    queue = [];
    online = true;
    queueOffline = false;
    phase = 'connected';
    status = 'active';
    vi.mocked(useOnlineStatus).mockImplementation(() => ({ isOnline: online }));
    vi.mocked(useActiveQueue).mockImplementation(() => ({
      queue,
      isLoading: false,
      isOffline: queueOffline,
      refresh: vi.fn(),
      resync: vi.fn(),
    }));
    vi.mocked(useSessionLifecycleContext).mockImplementation(() => ({
      sessionId: SESSION_ID,
      snapshot: { id: SESSION_ID, code: 'ABC234', status, closedAt: status === 'closed' ? '2026-08-11T22:00:00.000Z' : null },
      phase,
      epoch: 1,
      writesAllowed: false,
      newQueueEntriesAllowed: false,
      error: null,
      dispatch: vi.fn(),
    }) as any);
  });

  it('mostra fila vazia e QR por data URL', () => {
    renderDisplay();

    expect(screen.getByRole('heading', { name: /fila.*vazia/i })).toBeDefined();
    const image = document.querySelector('[data-display-join-panel] img') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe(qr.svgDataUrl);
    expect(screen.getByText(qr.entryUrl)).toBeDefined();
  });

  it('mostra cantor, próximo e fila sem ações administrativas', () => {
    queue = [
      entry({ id: 'singing', status: 'singing', participantName: 'Marina', position: 1 }),
      entry({ id: 'preparing', status: 'preparing', participantName: 'Diego', songTitle: 'Tempo Perdido', position: 2 }),
      entry({ id: 'pending', participantName: 'Aisha', songTitle: 'Velha Infância', position: 3 }),
    ];
    renderDisplay();

    expect(screen.getByText('Marina')).toBeDefined();
    expect(screen.getByText('Diego')).toBeDefined();
    expect(screen.getByText('Aisha')).toBeDefined();
    for (const label of ['Chamar', 'Iniciar', 'Finalizar', 'Pular', 'Cancelar', 'Pausar', 'Retomar', 'Encerrar']) {
      expect(screen.queryByRole('button', { name: new RegExp(label, 'i') })).toBeNull();
    }
  });

  it.each([
    ['paused', 'connected', true, /Novas entradas e pedidos/i],
    ['active', 'offline', true, /Sem conexão/i],
    ['active', 'reconnecting', true, /Reconectando/i],
  ] as const)('preserva a fila no estado %s/%s', (nextStatus, nextPhase, nextOnline, banner) => {
    status = nextStatus;
    phase = nextPhase;
    online = nextOnline;
    queue = [entry({ id: 'singing', status: 'singing' })];
    renderDisplay();

    expect(screen.getAllByText(banner).length).toBeGreaterThan(0);
    expect(screen.getByText('Marina')).toBeDefined();
    expect(screen.getByText('Evidências')).toBeDefined();
  });

  it('dá precedência ao offline sobre reconexão e pausa', () => {
    status = 'paused';
    phase = 'reconnecting';
    online = false;
    queue = [entry({ id: 'singing', status: 'singing' })];
    renderDisplay();

    expect(screen.getByText(/Sem conexão/i)).toBeDefined();
    expect(screen.queryByText(/Novas entradas e pedidos/i)).toBeNull();
  });

  it('mostra reconexão ao retornar online até a fila autoritativa ficar saudável', () => {
    online = false;
    queueOffline = true;
    renderDisplay();
    expect(screen.getAllByText(/Sem conexão/i).length).toBeGreaterThan(0);

    fireEvent(window, new Event('offline'));
    online = true;
    fireEvent(window, new Event('online'));

    expect(screen.getAllByText(/Reconectando/i).length).toBeGreaterThan(0);
    expect(document.querySelector('[data-display-state="reconnecting"]')).not.toBeNull();
  });

  it('remove imediatamente QR, código, nomes, músicas e fila ao encerrar', () => {
    status = 'closed';
    phase = 'closed';
    queue = [entry({ id: 'singing', status: 'singing' })];
    renderDisplay();

    expect(screen.getByRole('heading', { name: /Sala encerrada/i })).toBeDefined();
    expect(screen.queryByText('ABC234')).toBeNull();
    expect(screen.queryByText('Marina')).toBeNull();
    expect(screen.queryByText('Evidências')).toBeNull();
    expect(document.querySelector('[data-display-join-panel]')).toBeNull();
    expect(document.querySelector('[data-display-queue-preview]')).toBeNull();
  });

  it('usa a apresentação pública aprovada quando a origem não está configurada', () => {
    renderDisplay({ status: 'origin-not-configured' });

    expect(screen.getByText('Entre no Vocalis')).toBeDefined();
    expect(screen.getByText(/Use o código abaixo na tela de entrada/i)).toBeDefined();
    expect(screen.getByText('ABC234')).toBeDefined();
    expect(document.querySelector('[data-display-join-panel] img')).toBeNull();
    expect(screen.queryByText(/configur/i)).toBeNull();
    expect(screen.queryByText(/localhost/i)).toBeNull();
  });

  it('preserva semanticamente textos longos e Unicode completos', () => {
    const longName = 'Marina da Conceição 🎤 — Vozes do Coração em uma Noite Inesquecível';
    const longSong = 'Canção Extraordinariamente Longa — Versão Internacional Remasterizada';
    queue = [entry({ id: 'singing', status: 'singing', participantName: longName, songTitle: longSong })];
    renderDisplay();

    expect(screen.getByText(longName)).toBeDefined();
    expect(screen.getByText(longSong)).toBeDefined();
    expect(document.querySelector('[data-large-text]')).not.toBeNull();
  });
});
