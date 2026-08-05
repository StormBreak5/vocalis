/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ParticipantQueueExperience } from '@/src/components/participant/ParticipantQueueExperience';
import { useActiveQueue } from '@/src/hooks/useActiveQueue';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';
import { useSessionLifecycleContext } from '@/src/components/session/SessionLifecycleProvider';
import { cancelQueueEntryAction } from '@/src/application/queue/cancel-queue-entry.action';
import type { ActiveQueueEntry } from '@/src/domain/queue.types';

vi.mock('@/src/hooks/useActiveQueue', () => ({ useActiveQueue: vi.fn() }));
vi.mock('@/src/hooks/useOnlineStatus', () => ({ useOnlineStatus: vi.fn() }));
vi.mock('@/src/components/session/SessionLifecycleProvider', () => ({ useSessionLifecycleContext: vi.fn() }));
vi.mock('@/src/application/queue/cancel-queue-entry.action', () => ({ cancelQueueEntryAction: vi.fn() }));
vi.mock('@/src/application/queue/create-queue-entry.action', () => ({ createQueueEntryAction: vi.fn() }));

const participant = {
  id: 'participant-current', sessionId: 'session-1', displayName: 'Marina Costa', disambiguationIndex: 1,
  joinedAt: '2026-08-04', lastSeen: '2026-08-04', createdAt: '2026-08-04',
};

function entry(overrides: Partial<ActiveQueueEntry>): ActiveQueueEntry {
  return {
    id: 'queue-1', sessionId: 'session-1', participantId: 'participant-other', songTitle: 'Evidências',
    artist: 'Chitãozinho & Xororó', status: 'pending', position: 1, participantName: 'Outra Pessoa',
    createdAt: '2026-08-04', updatedAt: '2026-08-04', ...overrides,
  };
}

let queue: ActiveQueueEntry[];
let online: boolean;
let queueOffline: boolean;
let lifecycleStatus: 'active' | 'paused' | 'closed';
let lifecyclePhase: 'connected' | 'reconnecting' | 'offline';

function renderExperience() {
  return render(<ParticipantQueueExperience sessionId="session-1" roomCode="KARA89" participant={participant} />);
}

describe('ParticipantQueueExperience', () => {
  beforeEach(() => {
    queue = [];
    online = true;
    queueOffline = false;
    lifecycleStatus = 'active';
    lifecyclePhase = 'connected';
    vi.mocked(useOnlineStatus).mockImplementation(() => ({ isOnline: online }));
    vi.mocked(useActiveQueue).mockImplementation(() => ({ queue, isLoading: false, isOffline: queueOffline, refresh: vi.fn() }));
    vi.mocked(useSessionLifecycleContext).mockImplementation(() => ({
      sessionId: 'session-1', snapshot: { id: 'session-1', code: 'KARA89', status: lifecycleStatus, closedAt: null },
      phase: lifecyclePhase, epoch: 1, writesAllowed: lifecycleStatus !== 'closed' && lifecyclePhase === 'connected',
      newQueueEntriesAllowed: lifecycleStatus === 'active' && lifecyclePhase === 'connected', error: null, dispatch: vi.fn(),
    }) as any);
    vi.mocked(cancelQueueEntryAction).mockResolvedValue({ ok: true });
  });

  it('usa o item singing no hero sem duplicá-lo na fila compacta', () => {
    queue = [
      entry({ id: 'singing', status: 'singing', songTitle: 'Garota de Ipanema', participantName: 'Diego' }),
      entry({ id: 'waiting', position: 2, songTitle: 'Tempo Perdido' }),
    ];
    renderExperience();
    expect(screen.getByRole('heading', { name: 'Garota de Ipanema' })).toBeDefined();
    expect(screen.getByText(/Diego no microfone/i)).toBeDefined();
    expect(screen.getAllByText('Garota de Ipanema')).toHaveLength(1);
    expect(screen.getByText('Tempo Perdido')).toBeDefined();
  });

  it('mostra palco aguardando quando não existe item singing', () => {
    renderExperience();
    expect(screen.getByRole('heading', { name: 'Palco aguardando' })).toBeDefined();
  });

  it('deriva posição waiting e preserva título longo em duas linhas via classe compacta', () => {
    queue = [
      entry({ id: 'first', position: 1 }),
      entry({ id: 'mine', participantId: participant.id, participantName: participant.displayName, position: 2, songTitle: 'Bohemian Rhapsody' }),
      entry({ id: 'long', position: 3, songTitle: 'O Nome da Música É Muito Longo e Precisa Quebrar Bem' }),
    ];
    renderExperience();
    expect(screen.getByLabelText('Posição 02')).toBeDefined();
    expect(screen.getAllByText('Aguardando').length).toBeGreaterThan(0);
    expect(screen.getByText('O Nome da Música É Muito Longo e Precisa Quebrar Bem').className).toBeTruthy();
  });

  it.each([
    ['preparing', 'Você é o próximo'],
    ['singing', 'Você está cantando'],
  ] as const)('mostra o estado pessoal %s', (status, copy) => {
    queue = [entry({ id: 'mine', participantId: participant.id, status, participantName: participant.displayName })];
    renderExperience();
    expect(screen.getByText(copy)).toBeDefined();
  });

  it('oferece pedido quando não há pedido ativo e abre o painel com foco inicial', async () => {
    const user = userEvent.setup();
    renderExperience();
    const trigger = screen.getByRole('button', { name: 'Pedir música' });
    await user.click(trigger);
    expect(await screen.findByRole('dialog')).toBeDefined();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByPlaceholderText(/Ex: Evidências/i)));
  });

  it('fecha por Escape e restaura o foco ao gatilho', async () => {
    const user = userEvent.setup();
    renderExperience();
    const trigger = screen.getByRole('button', { name: 'Pedir música' });
    await user.click(trigger);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('fecha por ação explícita e mantém o fundo modal enquanto aberto', async () => {
    const user = userEvent.setup();
    renderExperience();
    await user.click(screen.getByRole('button', { name: 'Pedir música' }));
    expect(document.documentElement.style.overflow || document.body.style.overflow).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Fechar painel de pedido/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('troca o dock para estado informativo quando já existe pedido', () => {
    queue = [entry({ participantId: participant.id })];
    renderExperience();
    expect((screen.getByRole('button', { name: /Você já está na fila/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('mantém a fila visível e bloqueia pedido durante pausa', () => {
    lifecycleStatus = 'paused';
    queue = [entry({ songTitle: 'Música preservada' })];
    renderExperience();
    expect(screen.getByText(/DJ pausou novos pedidos/i)).toBeDefined();
    expect(screen.getByText('Música preservada')).toBeDefined();
    expect((screen.getByRole('button', { name: /Pedidos pausados pelo DJ/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('mostra offline honesto e não executa mutação', () => {
    online = false;
    queue = [entry({ participantId: participant.id })];
    renderExperience();
    expect(screen.getByText(/fila exibida pode estar desatualizada/i)).toBeDefined();
    const cancel = screen.getByRole('button', { name: /Cancelar seu pedido/i });
    expect((cancel as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(cancel);
    expect(cancelQueueEntryAction).not.toHaveBeenCalled();
  });
});
