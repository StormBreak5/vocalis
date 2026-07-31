'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { SessionLifecycleState, SessionStatusSnapshot } from '@/src/domain/session.types';
import type { SessionLifecycleEvent } from '@/src/hooks/session-lifecycle.reducer';
import { useSessionLifecycle } from '@/src/hooks/useSessionLifecycle';

type SessionLifecycleContextValue = SessionLifecycleState & { sessionId: string; dispatch: React.Dispatch<SessionLifecycleEvent> };
const SessionLifecycleContext = createContext<SessionLifecycleContextValue | null>(null);

export function SessionLifecycleProvider({ sessionId, initialSnapshot, children }: { sessionId: string; initialSnapshot: SessionStatusSnapshot; children: ReactNode }) {
  const { state, dispatch } = useSessionLifecycle(sessionId, initialSnapshot);
  const value = useMemo(() => ({ ...state, sessionId, dispatch }), [state, sessionId, dispatch]);
  
  return <SessionLifecycleContext.Provider value={value}>{children}</SessionLifecycleContext.Provider>;
}

export function useSessionLifecycleContext(): SessionLifecycleContextValue {
  const value=useContext(SessionLifecycleContext);
  if(!value) throw new Error('useSessionLifecycleContext exige SessionLifecycleProvider.');
  return value;
}
