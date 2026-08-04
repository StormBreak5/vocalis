/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RequestSongForm } from '@/src/components/queue/RequestSongForm';
import { QueueItem } from '@/src/components/queue/QueueItem';
import * as LifecycleProvider from '@/src/components/session/SessionLifecycleProvider';

vi.mock('@/src/application/queue/create-queue-entry.action', () => ({ createQueueEntryAction: vi.fn() }));

const mockContext = vi.spyOn(LifecycleProvider, 'useSessionLifecycleContext');
const entry = { id: '1', songTitle: 'A', artist: 'B', participantName: 'P', status: 'pending' as const, participantId: '2', sessionId: '123', position: 1, createdAt: '2023-01-01', updatedAt: '2023-01-01' };

function renderWithStatus(ui: React.ReactElement, status: 'active' | 'paused' | 'closed') {
  mockContext.mockReturnValue({
    phase: status === 'closed' ? 'closed' : 'connected',
    snapshot: { id: '11111111-1111-4111-8111-111111111111', code: 'ABC234', status, closedAt: status === 'closed' ? '2026-08-04T12:00:00Z' : null },
    writesAllowed: status !== 'closed',
    newQueueEntriesAllowed: status === 'active',
    sessionId: '11111111-1111-4111-8111-111111111111',
    epoch: 1,
    error: null,
    dispatch: vi.fn(),
  } as any);
  return render(ui);
}

describe('Session Write Controls', () => {
  beforeEach(() => vi.clearAllMocks());

  it('permite novos pedidos em active', () => {
    renderWithStatus(<RequestSongForm sessionId="123" />, 'active');
    expect((screen.getByPlaceholderText(/Ex: Evidências/i) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: /Colocar na Fila/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('desabilita novos pedidos em paused com mensagem específica', () => {
    renderWithStatus(<RequestSongForm sessionId="123" />, 'paused');
    expect((screen.getByPlaceholderText(/Ex: Evidências/i) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Colocar na Fila/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/fila está pausada/i)).toBeDefined();
    expect(screen.queryByText(/sala foi encerrada/i)).toBeNull();
  });

  it('desabilita novos pedidos em closed com mensagem de encerramento', () => {
    renderWithStatus(<RequestSongForm sessionId="123" />, 'closed');
    expect((screen.getByRole('button', { name: /Colocar na Fila/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/sala foi encerrada/i)).toBeDefined();
    expect(screen.queryByText(/fila está pausada/i)).toBeNull();
  });

  it('mantém controles da fila existente disponíveis em paused', () => {
    renderWithStatus(<QueueItem entry={entry} isCurrentUser={false} isHost />, 'paused');
    expect((screen.getByRole('button', { name: /Chamar/i }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: /Pular/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('remove controles do Host e bloqueia cancelamento em closed', () => {
    const { unmount } = renderWithStatus(<QueueItem entry={entry} isCurrentUser={false} isHost />, 'closed');
    expect(screen.queryByRole('button', { name: /Chamar/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Pular/i })).toBeNull();
    unmount();

    renderWithStatus(<QueueItem entry={entry} isCurrentUser isHost={false} />, 'closed');
    expect((screen.getByRole('button', { name: /Cancelar/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
