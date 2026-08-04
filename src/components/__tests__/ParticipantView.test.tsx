import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ParticipantView } from '../participant/ParticipantView';
import { useSessionLifecycleContext } from '@/src/components/session/SessionLifecycleProvider';

vi.mock('@/src/components/session/SessionLifecycleProvider', () => ({ useSessionLifecycleContext: vi.fn() }));

const baseParticipant = {
  id: '1',
  sessionId: 's-1',
  displayName: 'John',
  disambiguationIndex: 1,
  joinedAt: 'now',
  lastSeen: 'now',
  createdAt: 'now',
  isCurrentUser: true,
};
const activeSession = { code: 'AABB22', status: 'active' as const };

function context(status: 'active' | 'paused') {
  return {
    sessionId: '11111111-1111-4111-8111-111111111111',
    snapshot: { id: '11111111-1111-4111-8111-111111111111', code: 'AABB22', status, closedAt: null },
    phase: 'connected',
    epoch: 1,
    writesAllowed: true,
    newQueueEntriesAllowed: status === 'active',
    error: null,
    dispatch: vi.fn(),
  };
}

describe('ParticipantView', () => {
  beforeEach(() => vi.mocked(useSessionLifecycleContext).mockReturnValue(context('active') as never));

  it('displays formatted label and current-user badge', () => {
    render(<ParticipantView participant={{ ...baseParticipant, disambiguationIndex: 2 }} session={activeSession} />);
    expect(screen.getByText('John #2')).toBeDefined();
    expect(screen.getByLabelText('Este é você')).toBeDefined();
  });

  it('não mostra current-user badge para outro participante', () => {
    render(<ParticipantView participant={{ ...baseParticipant, isCurrentUser: false }} session={activeSession} />);
    expect(screen.queryByLabelText('Este é você')).toBeNull();
  });

  it('exibe e remove o aviso conforme atualizações vivas do contexto', () => {
    const { rerender } = render(<ParticipantView participant={baseParticipant} session={activeSession} />);
    expect(screen.queryByText('A fila está pausada.')).toBeNull();

    vi.mocked(useSessionLifecycleContext).mockReturnValue(context('paused') as never);
    rerender(<ParticipantView participant={baseParticipant} session={activeSession} />);
    expect(screen.getByText('A fila está pausada.')).toBeDefined();

    vi.mocked(useSessionLifecycleContext).mockReturnValue(context('active') as never);
    rerender(<ParticipantView participant={baseParticipant} session={activeSession} />);
    expect(screen.queryByText('A fila está pausada.')).toBeNull();
  });
});
