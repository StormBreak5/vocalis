import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ParticipantView } from '../participant/ParticipantView';

describe('ParticipantView', () => {
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

  it('displays formatted label correctly', () => {
    render(<ParticipantView participant={{ ...baseParticipant, disambiguationIndex: 2 }} session={activeSession} />);
    expect(screen.getByText('John #2')).toBeDefined();
  });

  it('Você badge visible when isCurrentUser = true', () => {
    render(<ParticipantView participant={{ ...baseParticipant, isCurrentUser: true }} session={activeSession} />);
    expect(screen.getByLabelText('Este é você')).toBeDefined();
    expect(screen.getByText('Você')).toBeDefined();
  });

  it('Você badge NOT present when isCurrentUser = false', () => {
    render(<ParticipantView participant={{ ...baseParticipant, isCurrentUser: false }} session={activeSession} />);
    expect(screen.queryByLabelText('Este é você')).toBeNull();
  });

  it('paused banner shown when session.status = paused', () => {
    render(<ParticipantView participant={baseParticipant} session={{ code: 'AABB22', status: 'paused' as const }} />);
    expect(screen.getByText('A fila está pausada.')).toBeDefined();
  });

  it('paused banner not shown when session.status = active', () => {
    render(<ParticipantView participant={baseParticipant} session={activeSession} />);
    expect(screen.queryByText('A fila está pausada.')).toBeNull();
  });
});
