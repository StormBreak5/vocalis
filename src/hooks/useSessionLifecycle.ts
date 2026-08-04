'use client';

import { useEffect, useReducer, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/src/infrastructure/supabase/client';
import {
  initialSessionLifecycleState,
  sessionLifecycleReducer,
} from './session-lifecycle.reducer';
import { getSessionStatus } from '@/src/application/session/get-session-status';
import { parseSessionRealtimeEnvelope } from '@/src/domain/session-lifecycle';
import type { SessionStatusSnapshot } from '@/src/domain/session.types';
import { registerRoomCleanup } from './session-room-cleanup';

type SessionRealtimeStatus =
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'TIMED_OUT'
  | 'CLOSED'
  | 'TOKEN_REFRESHED'
  | string;

type SessionPayloadHandler = (payload: unknown) => void;
type SessionStatusHandler = (status: SessionRealtimeStatus) => void;

export interface SessionLifecycleDependencies {
  getSessionStatus: typeof getSessionStatus;
  subscribeToSession: (
    sessionId: string,
    onPayload: SessionPayloadHandler,
    onStatus: SessionStatusHandler,
  ) => () => void;
}

const defaultDependencies: SessionLifecycleDependencies = {
  getSessionStatus,
  subscribeToSession(sessionId, onPayload, onStatus) {
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    const setupChannel = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;

      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      } else {
        await supabase.realtime.setAuth();
      }
      if (cancelled) return;

      channel = supabase
        .channel('session-' + sessionId + '-' + crypto.randomUUID())
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'sessions',
            filter: 'id=eq.' + sessionId,
            select: ['id', 'code', 'status', 'closed_at'],
          },
          (payload) => onPayload(payload),
        )
        .subscribe((status) => onStatus(status));
    };

    void setupChannel().catch(() => onStatus('CHANNEL_ERROR'));

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        const updateRealtimeAuth = session?.access_token
          ? supabase.realtime.setAuth(session.access_token)
          : supabase.realtime.setAuth();
        void updateRealtimeAuth
          .then(() => onStatus('TOKEN_REFRESHED'))
          .catch(() => onStatus('CHANNEL_ERROR'));
      }
    });

    return () => {
      cancelled = true;
      authSubscription.unsubscribe();
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  },
};

export function useSessionLifecycle(
  sessionId: string,
  initialSnapshot: SessionStatusSnapshot,
  dependencies: SessionLifecycleDependencies = defaultDependencies,
) {
  const seeded = sessionLifecycleReducer(initialSessionLifecycleState, {
    type: 'snapshot',
    snapshot: initialSnapshot,
  });
  const [state, dispatch] = useReducer(sessionLifecycleReducer, seeded);
  const isClosedRef = useRef(seeded.phase === 'closed');

  useEffect(() => {
    isClosedRef.current = state.phase === 'closed';
  }, [state.phase]);

  useEffect(() => {
    if (initialSnapshot.status === 'closed' && state.phase !== 'closed') {
      isClosedRef.current = true;
      dispatch({ type: 'SESSION_UPDATED', snapshot: initialSnapshot });
    }
  }, [initialSnapshot, state.phase]);

  useEffect(() => {
    let isMounted = true;

    const resync = async () => {
      if (!isMounted || isClosedRef.current) return;

      try {
        const result = await dependencies.getSessionStatus(sessionId);
        if (!isMounted) return;

        if (result.ok) {
          if (result.snapshot.status === 'closed') {
            isClosedRef.current = true;
          }
          dispatch({ type: 'SESSION_UPDATED', snapshot: result.snapshot });
        }
      } catch {
        if (isMounted) {
          dispatch({ type: 'reconnecting' });
        }
      }
    };

    const handlePayload: SessionPayloadHandler = (payload) => {
      if (!isMounted || isClosedRef.current) return;

      try {
        const envelope = parseSessionRealtimeEnvelope(payload);
        if (envelope.new.id !== sessionId) {
          throw new Error('Evento Realtime de outra sessão.');
        }

        const snapshot: SessionStatusSnapshot = {
          id: envelope.new.id,
          code: envelope.new.code,
          status: envelope.new.status,
          closedAt: envelope.new.closed_at,
        };

        if (snapshot.status === 'closed') {
          isClosedRef.current = true;
        }
        dispatch({ type: 'SESSION_UPDATED', snapshot });
      } catch {
        dispatch({ type: 'reconnecting' });
        void resync();
      }
    };

    const handleStatus: SessionStatusHandler = (status) => {
      if (!isMounted || isClosedRef.current) return;

      if (status === 'SUBSCRIBED' || status === 'TOKEN_REFRESHED') {
        void resync();
      } else if (
        status === 'CHANNEL_ERROR'
        || status === 'TIMED_OUT'
        || status === 'CLOSED'
      ) {
        dispatch({ type: 'reconnecting' });
        void resync();
      }
    };

    const unsubscribe = dependencies.subscribeToSession(
      sessionId,
      handlePayload,
      handleStatus,
    );

    let didUnsubscribe = false;
    const unsubscribeOnce = () => {
      if (didUnsubscribe) return;
      didUnsubscribe = true;
      unsubscribe();
    };
    const unregisterRoomCleanup = registerRoomCleanup(sessionId, unsubscribeOnce);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void resync();
      }
    };
    const handleOnline = () => {
      void resync();
    };
    const handlePageShow = () => {
      void resync();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      isMounted = false;
      unregisterRoomCleanup();
      unsubscribeOnce();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [dependencies, sessionId]);

  return { state, dispatch };
}