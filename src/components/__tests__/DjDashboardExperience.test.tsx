/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ActiveQueueEntry } from '@/src/domain/queue.types';
import { DjDashboardExperience } from '@/src/components/dj/DjDashboardExperience';
import { useActiveQueue } from '@/src/hooks/useActiveQueue';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';
import { useSessionParticipants } from '@/src/hooks/useSessionParticipants';
import { useSessionPresence } from '@/src/hooks/useSessionPresence';
import { useSessionLifecycleContext } from '@/src/components/session/SessionLifecycleProvider';
import { updateQueueStatusAction } from '@/src/application/queue/update-queue-status.action';

vi.mock('@/src/hooks/useActiveQueue', () => ({ useActiveQueue: vi.fn() }));
vi.mock('@/src/hooks/useOnlineStatus', () => ({ useOnlineStatus: vi.fn() }));
vi.mock('@/src/hooks/useSessionParticipants', () => ({ useSessionParticipants: vi.fn() }));
vi.mock('@/src/hooks/useSessionPresence', () => ({ useSessionPresence: vi.fn() }));
vi.mock('@/src/components/session/SessionLifecycleProvider', () => ({ useSessionLifecycleContext: vi.fn() }));
vi.mock('@/src/application/queue/update-queue-status.action', () => ({ updateQueueStatusAction: vi.fn() }));
vi.mock('@/src/application/session/update-session-status.action', () => ({ updateSessionStatusAction: vi.fn() }));
vi.mock('@/src/application/session/get-session-status', () => ({ getSessionStatus: vi.fn() }));
vi.mock('@/src/application/session/close-session.action', () => ({ closeSessionAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const resync = vi.fn(async () => undefined);

function entry(overrides: Partial<ActiveQueueEntry> = {}): ActiveQueueEntry {
  return {
    id: 'queue-1',
    sessionId: SESSION_ID,
    participantId: 'participant-1',
    songTitle: 'Evidências',
    artist: 'Chitãozinho & Xororó',
    status: 'pending',
    position: 1,
    participantName: 'Marina Costa',
    createdAt: '2026-08-10T21:00:00Z',
    updatedAt: '2026-08-10T21:00:00Z',
    ...overrides,
  };
}

let queue: ActiveQueueEntry[];
let online: boolean;
let queueOffline: boolean;
let queueLoading: boolean;
let status: 'active' | 'paused' | 'closed';
let phase: 'connected' | 'reconnecting' | 'offline';

function renderDashboard() {
  return render(
    <DjDashboardExperience
      sessionId={SESSION_ID}
      roomCode="NEON42"
      initialParticipants={[]}
    />,
  );
}

describe('DjDashboardExperience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queue = [];
    online = true;
    queueOffline = false;
    queueLoading = false;
    status = 'active';
    phase = 'connected';
    vi.mocked(useOnlineStatus).mockImplementation(() => ({ isOnline: online }));
    vi.mocked(useActiveQueue).mockImplementation(() => ({
      queue,
      isLoading: queueLoading,
      isOffline: queueOffline,
      refresh: vi.fn(),
      resync,
    }));
    vi.mocked(useSessionParticipants).mockReturnValue([
      {
        id: 'participant-1', sessionId: SESSION_ID, displayName: 'Marina Costa',
        disambiguationIndex: 1, joinedAt: '2026-08-10T21:03:00Z',
        lastSeen: '2026-08-10T21:03:00Z', createdAt: '2026-08-10T21:03:00Z',
      },
    ]);
    vi.mocked(useSessionPresence).mockReturnValue(new Set(['participant-1']));
    vi.mocked(useSessionLifecycleContext).mockImplementation(() => ({
      sessionId: SESSION_ID,
      snapshot: { id: SESSION_ID, code: 'NEON42', status, closedAt: null },
      phase,
      epoch: 1,
      writesAllowed: status !== 'closed' && phase === 'connected',
      newQueueEntriesAllowed: status === 'active' && phase === 'connected',
      error: null,
      dispatch: vi.fn(),
    }) as any);
    vi.mocked(updateQueueStatusAction).mockResolvedValue({
      ok: true,
      result: { id: 'queue-1', status: 'preparing', updatedAt: '2026-08-10T21:04:00Z', changed: true },
    });
  });

  it('separa singing, preparing e waiting com somente as ações válidas', () => {
    queue = [
      entry({ id: 'singing', status: 'singing', songTitle: 'Garota de Ipanema', position: 1 }),
      entry({ id: 'preparing', status: 'preparing', songTitle: 'Tempo Perdido', position: 2 }),
      entry({ id: 'pending', status: 'pending', songTitle: 'Bohemian Rhapsody', position: 3 }),
    ];
    renderDashboard();

    const hero = screen.getAllByTestId('dj-now-singing')[0];
    expect(within(hero).getByRole('button', { name: /Finalizar Marina Costa/ })).toBeDefined();
    expect(within(hero).queryByRole('button', { name: /Chamar/ })).toBeNull();
    expect(within(hero).queryByRole('button', { name: /Iniciar/ })).toBeNull();

    const next = screen.getAllByTestId('dj-next-preparing')[0];
    expect(within(next).getByRole('button', { name: /Iniciar Marina Costa/ })).toBeDefined();
    expect(within(next).queryByRole('button', { name: /Finalizar/ })).toBeNull();

    const waiting = screen.getAllByTestId('dj-waiting-queue')[0];
    expect(within(waiting).getByText('Bohemian Rhapsody')).toBeDefined();
    expect(within(waiting).getByRole('button', { name: /Chamar Marina Costa/ })).toBeDefined();
    expect(within(waiting).getByRole('button', { name: 'Pular Marina Costa' })).toBeDefined();
  });

  it('mantém Chamar e Pular em todos os itens aguardando autorizados', () => {
    queue = [
      entry({ id: 'pending-1', participantName: 'Marina', position: 1 }),
      entry({ id: 'pending-2', participantName: 'Diego', position: 2 }),
    ];
    renderDashboard();
    const desktopQueue = screen.getAllByTestId('dj-waiting-queue')[0];
    expect(within(desktopQueue).getAllByRole('button', { name: /Chamar/ })).toHaveLength(2);
    expect(within(desktopQueue).getByRole('button', { name: 'Pular Marina' })).toBeDefined();
    expect(within(desktopQueue).getByRole('button', { name: 'Pular Diego' })).toBeDefined();
  });

  it('mostra fila vazia sem oferecer ações de item', () => {
    renderDashboard();
    expect(screen.getAllByRole('heading', { name: 'A fila está vazia' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Chamar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Iniciar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Finalizar/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Pausar fila' }).length).toBeGreaterThan(0);
  });

  it('permite operar itens existentes durante paused', async () => {
    status = 'paused';
    queue = [entry({ id: 'paused-entry', status: 'pending' })];
    renderDashboard();
    expect(screen.getByText(/músicas existentes continuam operáveis/i)).toBeDefined();
    fireEvent.click(screen.getAllByRole('button', { name: /Chamar/ })[0]);
    await waitFor(() => expect(updateQueueStatusAction).toHaveBeenCalledWith('paused-entry', 'preparing'));
  });

  it('bloqueia fila e controles globais quando offline', () => {
    online = false;
    queue = [entry({ id: 'offline-entry' })];
    renderDashboard();
    expect(screen.getByText(/estado exibido pode estar desatualizado/i)).toBeDefined();
    expect((screen.getAllByRole('button', { name: /Chamar/ })[0] as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getAllByRole('button', { name: 'Pausar fila' })[0] as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getAllByRole('button', { name: 'Encerrar sala' })[0] as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('dj-operational-dock').textContent).toContain('ações indisponíveis');
  });

  it('anuncia loading e impede chamadas duplicadas', async () => {
    queue = [entry({ id: 'slow-entry' })];
    let resolveAction!: (value: Awaited<ReturnType<typeof updateQueueStatusAction>>) => void;
    vi.mocked(updateQueueStatusAction).mockReturnValue(new Promise((resolve) => { resolveAction = resolve; }));
    renderDashboard();
    const button = screen.getAllByRole('button', { name: /Chamar/ })[0];
    fireEvent.click(button);
    fireEvent.click(button);
    expect(updateQueueStatusAction).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Atualizando a fila.')).toBeDefined();
    resolveAction({ ok: true, result: { id: 'slow-entry', status: 'preparing', updatedAt: '2026-08-10T21:04:00Z', changed: true } });
    await waitFor(() => expect(resync).toHaveBeenCalled());
  });

  it('oferece abas acessíveis por toque e teclado sem desmontar os painéis', async () => {
    const user = userEvent.setup();
    renderDashboard();
    const queueTab = screen.getByRole('tab', { name: /Fila · 0/i });
    const participantsTab = screen.getByRole('tab', { name: /Participantes · 1/i });
    expect(queueTab.getAttribute('aria-selected')).toBe('true');
    await user.click(participantsTab);
    expect(participantsTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getAllByText('Marina Costa').length).toBeGreaterThan(0);
    participantsTab.focus();
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(queueTab);
    await user.keyboard('{Enter}');
    expect(queueTab.getAttribute('aria-selected')).toBe('true');
  });

  it('preserva o participante registrado sem contá-lo como online', () => {
    vi.mocked(useSessionPresence).mockReturnValue(new Set());
    renderDashboard();

    expect(screen.getAllByText('Marina Costa').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Offline').length).toBeGreaterThan(0);
    expect(screen.getAllByText('0 online · 1 registrados').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('0 participantes online').length).toBeGreaterThan(0);
  });

  it('preserva títulos longos e restaura foco operacional após a resposta', async () => {
    const user = userEvent.setup();
    queue = [entry({ id: 'long-entry', songTitle: 'The Long and Winding Road — Remastered 2009 Deluxe Edition' })];
    renderDashboard();
    const button = screen.getAllByRole('button', { name: /Chamar/ })[0];
    await user.click(button);
    await waitFor(() => expect(resync).toHaveBeenCalled());
    expect(screen.getAllByText(/The Long and Winding Road/)[0].className).toBeTruthy();
    expect(document.activeElement).not.toBe(document.body);
  });
});
