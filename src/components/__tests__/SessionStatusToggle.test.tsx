import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionStatusToggle } from '@/src/components/session/SessionStatusToggle';
import { updateSessionStatusAction } from '@/src/application/session/update-session-status.action';
import { getSessionStatus } from '@/src/application/session/get-session-status';
import { useSessionLifecycleContext } from '@/src/components/session/SessionLifecycleProvider';
import { toast } from 'sonner';

vi.mock('@/src/application/session/update-session-status.action', () => ({ updateSessionStatusAction: vi.fn() }));
vi.mock('@/src/application/session/get-session-status', () => ({ getSessionStatus: vi.fn() }));
vi.mock('@/src/components/session/SessionLifecycleProvider', () => ({ useSessionLifecycleContext: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const dispatch = vi.fn();

function lifecycle(status: 'active' | 'paused' | 'closed' | null, phase = 'connected') {
  return {
    sessionId: SESSION_ID,
    snapshot: status ? { id: SESSION_ID, code: 'ABC234', status, closedAt: status === 'closed' ? '2026-08-04T12:00:00Z' : null } : null,
    phase,
    epoch: 1,
    writesAllowed: status !== 'closed' && phase === 'connected',
    newQueueEntriesAllowed: status === 'active' && phase === 'connected',
    error: null,
    dispatch,
  };
}

describe('SessionStatusToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSessionLifecycleContext).mockReturnValue(lifecycle('active') as never);
    vi.mocked(getSessionStatus).mockResolvedValue({ ok: false, code: 'UNKNOWN', userMessage: 'Falha.' });
  });

  it('acompanha active, paused e closed recebidos pelo contexto', () => {
    const { rerender } = render(<SessionStatusToggle />);
    expect((screen.getByRole('button', { name: 'Pausar fila' }) as HTMLButtonElement).disabled).toBe(false);

    vi.mocked(useSessionLifecycleContext).mockReturnValue(lifecycle('paused') as never);
    rerender(<SessionStatusToggle />);
    expect((screen.getByRole('button', { name: 'Retomar fila' }) as HTMLButtonElement).disabled).toBe(false);

    vi.mocked(useSessionLifecycleContext).mockReturnValue(lifecycle('closed') as never);
    rerender(<SessionStatusToggle />);
    expect((screen.getByRole('button', { name: 'Pausar fila' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('permanece indisponível durante loading', () => {
    vi.mocked(useSessionLifecycleContext).mockReturnValue(lifecycle(null, 'loading') as never);
    render(<SessionStatusToggle />);
    expect((screen.getByRole('button', { name: 'Pausar fila' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('executa active → paused → active e aplica o snapshot confirmado', async () => {
    vi.mocked(updateSessionStatusAction)
      .mockResolvedValueOnce({ ok: true, result: { id: SESSION_ID, status: 'paused', changed: true } })
      .mockResolvedValueOnce({ ok: true, result: { id: SESSION_ID, status: 'active', changed: true } });

    const { rerender } = render(<SessionStatusToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Pausar fila' }));
    await waitFor(() => expect(updateSessionStatusAction).toHaveBeenCalledWith(SESSION_ID, 'paused'));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'SESSION_UPDATED',
      snapshot: expect.objectContaining({ status: 'paused' }),
    }));

    vi.mocked(useSessionLifecycleContext).mockReturnValue(lifecycle('paused') as never);
    rerender(<SessionStatusToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Retomar fila' }));
    await waitFor(() => expect(updateSessionStatusAction).toHaveBeenLastCalledWith(SESSION_ID, 'active'));
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'SESSION_UPDATED',
      snapshot: expect.objectContaining({ status: 'active' }),
    }));
  });

  it('confirma o estado persistido após resposta incerta', async () => {
    vi.mocked(updateSessionStatusAction).mockResolvedValue({
      ok: false,
      code: 'RESPONSE_UNCERTAIN',
      userMessage: 'Não foi possível confirmar.',
    });
    vi.mocked(getSessionStatus).mockResolvedValue({
      ok: true,
      snapshot: { id: SESSION_ID, code: 'ABC234', status: 'paused', closedAt: null },
    });

    render(<SessionStatusToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Pausar fila' }));

    await waitFor(() => expect(getSessionStatus).toHaveBeenCalledWith(SESSION_ID));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'SESSION_UPDATED',
      snapshot: expect.objectContaining({ status: 'paused' }),
    }));
    expect(toast.success).toHaveBeenCalled();
  });

  it('mantém o estado confirmado e permite nova tentativa quando a alteração não persistiu', async () => {
    vi.mocked(updateSessionStatusAction).mockResolvedValue({
      ok: false,
      code: 'RESPONSE_UNCERTAIN',
      userMessage: 'Não foi possível confirmar.',
    });
    vi.mocked(getSessionStatus).mockResolvedValue({
      ok: true,
      snapshot: { id: SESSION_ID, code: 'ABC234', status: 'active', closedAt: null },
    });

    render(<SessionStatusToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Pausar fila' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'SESSION_UPDATED',
      snapshot: expect.objectContaining({ status: 'active' }),
    }));
    expect((screen.getByRole('button', { name: 'Pausar fila' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('não dispara chamadas duplicadas enquanto uma atualização está em andamento', async () => {
    let resolveAction!: (value: Awaited<ReturnType<typeof updateSessionStatusAction>>) => void;
    vi.mocked(updateSessionStatusAction).mockReturnValue(new Promise((resolve) => { resolveAction = resolve; }));

    render(<SessionStatusToggle />);
    const button = screen.getByRole('button', { name: 'Pausar fila' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(updateSessionStatusAction).toHaveBeenCalledTimes(1);

    resolveAction({ ok: true, result: { id: SESSION_ID, status: 'paused', changed: true } });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });
});
