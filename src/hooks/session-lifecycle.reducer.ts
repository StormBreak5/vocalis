import type { SessionLifecycleState, SessionStatusSnapshot } from '@/src/domain/session.types';

export type SessionLifecycleEvent =
  | { type: 'loading' }
  | { type: 'snapshot'; snapshot: SessionStatusSnapshot }
  | { type: 'SESSION_UPDATED'; snapshot: SessionStatusSnapshot }
  | { type: 'snapshot_reconnecting'; snapshot: SessionStatusSnapshot }
  | { type: 'reconnecting' }
  | { type: 'offline' }
  | { type: 'error'; message: string }
  | { type: 'reset' };

export const initialSessionLifecycleState: SessionLifecycleState = { snapshot:null, phase:'loading', epoch:0, writesAllowed:false, newQueueEntriesAllowed:false, error:null };

export function sessionLifecycleReducer(state: SessionLifecycleState, event: SessionLifecycleEvent): SessionLifecycleState {
  if (state.phase === 'closed' && event.type !== 'reset') return state;
  switch(event.type) {
    case 'loading': return { ...state, phase:'loading', writesAllowed:false, newQueueEntriesAllowed:false, error:null };
    case 'snapshot':
    case 'SESSION_UPDATED': {
      const isClosed = event.snapshot.status === 'closed';
      const coherentSnapshot = isClosed && !event.snapshot.closedAt
        ? { ...event.snapshot, closedAt: new Date().toISOString() }
        : event.snapshot;
      return { 
        snapshot: coherentSnapshot, 
        phase: isClosed ? 'closed' : 'connected', 
        epoch: state.epoch + 1, 
        writesAllowed: !isClosed, 
        newQueueEntriesAllowed: event.snapshot.status === 'active',
        error: null 
      };
    }
    case 'snapshot_reconnecting':
      return {
        snapshot: event.snapshot,
        phase: 'reconnecting',
        epoch: state.epoch + 1,
        writesAllowed: false,
        newQueueEntriesAllowed: false,
        error: null,
      };
    case 'reconnecting': {
      // Mantém coesão caso esteja reconectando de uma sessão fechada localmente
      if (state.snapshot?.status === 'closed') return state;
      return { ...state, phase:'reconnecting', writesAllowed:false, newQueueEntriesAllowed:false, error:null };
    }
    case 'offline': return { ...state, phase:'offline', writesAllowed:false, newQueueEntriesAllowed:false };
    case 'error': return { ...state, phase:'error', writesAllowed:false, newQueueEntriesAllowed:false, error:event.message };
    case 'reset': return initialSessionLifecycleState;
  }
}
