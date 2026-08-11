import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HostDashboardPage from '@/app/sala/[code]/dj/page';
import { getHostSessionDetails, getSessionStatusRowByCode } from '@/src/infrastructure/supabase/queries/session.queries';
import { redirect } from 'next/navigation';

vi.mock('@/src/infrastructure/supabase/queries/session.queries', () => ({
  getHostSessionDetails: vi.fn(),
  getSessionStatusRowByCode: vi.fn(),
}));
vi.mock('@/src/infrastructure/supabase/queries/participant.queries', () => ({ getParticipantsBySessionId: vi.fn().mockResolvedValue([]) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT'); }) }));
vi.mock('@/src/components/session/SessionLifecycleProvider', () => ({ SessionLifecycleProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/src/components/dj/DjDashboardExperience', () => ({ DjDashboardExperience: () => <button>Pausar fila</button> }));
vi.mock('@/src/components/session/SessionStatusToggle', () => ({ SessionStatusToggle: () => <button>Pausar fila</button> }));
vi.mock('@/src/components/session/CloseSessionButton', () => ({ CloseSessionButton: () => <button>Encerrar sala</button> }));
vi.mock('@/src/components/session/SessionCodeDisplay', () => ({ SessionCodeDisplay: () => null }));
vi.mock('@/src/components/session/SessionClosedDialog', () => ({ SessionClosedDialog: () => null }));
vi.mock('@/src/components/queue/QueueList', () => ({ QueueList: () => null }));
vi.mock('@/src/components/participant/ParticipantsList', () => ({ ParticipantsList: () => null }));

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

describe('HostDashboard pause/resume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSessionStatusRowByCode).mockResolvedValue({ id: SESSION_ID, code: 'ABC234', status: 'active', closed_at: null });
    vi.mocked(getHostSessionDetails).mockResolvedValue({
      id: SESSION_ID,
      code: 'ABC234',
      status: 'active',
      closedAt: null,
      createdAt: '2026-08-04T12:00:00Z',
      maxParticipants: 50,
      maxQueueEntries: 200,
    });
  });

  it('renderiza o controle para o Host autenticado', async () => {
    render(await HostDashboardPage({ params: Promise.resolve({ code: 'ABC234' }) }));
    expect(screen.getByRole('button', { name: 'Pausar fila' })).toBeDefined();
  });

  it('redireciona usuário que não é Host antes de entregar o controle', async () => {
    vi.mocked(getHostSessionDetails).mockResolvedValue(null);
    await expect(HostDashboardPage({ params: Promise.resolve({ code: 'ABC234' }) })).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/sala/ABC234');
  });
});
