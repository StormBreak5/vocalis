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
  | string;

type SessionPayloadHandler = (payload: unknown) => void;
type SessionStatusHandler = (status: SessionRealtimeStatus) => void;
type ChannelLifecycle =
  | 'absent'
  | 'recovering'
  | 'subscribing'
  | 'subscribed'
  | 'retrying'
  | 'closed';

const CHANNEL_RECOVERY_BACKOFF_MS = [250, 750, 1_500, 3_000] as const;

export interface SessionRealtimeSubscription {
  unsubscribe: () => void | Promise<void>;
}

export interface SessionRealtimeAdapter {
  getAccessToken: () => Promise<string | undefined>;
  setAuth: (accessToken?: string) => Promise<void>;
  subscribe: (
    sessionId: string,
    onPayload: SessionPayloadHandler,
    onStatus: SessionStatusHandler,
  ) => SessionRealtimeSubscription;
  onTokenRefreshed: (
    onToken: (accessToken?: string) => void,
  ) => () => void;
}

export interface SessionLifecycleDependencies {
  getSessionStatus: typeof getSessionStatus;
  createRealtimeAdapter: () => SessionRealtimeAdapter;
}

function createDefaultRealtimeAdapter(): SessionRealtimeAdapter {
  const supabase = createClient();

  return {
    async getAccessToken() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      return session?.access_token;
    },
    async setAuth(accessToken) {
      if (accessToken) await supabase.realtime.setAuth(accessToken);
      else await supabase.realtime.setAuth();
    },
    subscribe(sessionId, onPayload, onStatus) {
      const channel: RealtimeChannel = supabase
        .channel(`session-${sessionId}-${crypto.randomUUID()}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'sessions',
            filter: `id=eq.${sessionId}`,
            select: ['id', 'code', 'status', 'closed_at'],
          },
          onPayload,
        )
        .subscribe(onStatus);

      return {
        async unsubscribe() {
          await supabase.removeChannel(channel);
        },
      };
    },
    onTokenRefreshed(onToken) {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'TOKEN_REFRESHED') onToken(session?.access_token);
      });
      return () => subscription.unsubscribe();
    },
  };
}

const defaultDependencies: SessionLifecycleDependencies = {
  getSessionStatus,
  createRealtimeAdapter: createDefaultRealtimeAdapter,
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
    if (initialSnapshot.status === 'closed') return;

    let cleanupStarted = false;
    let terminal = false;
    const realtime = dependencies.createRealtimeAdapter();
    let registeredSubscription: SessionRealtimeSubscription | null = null;
    let channelLifecycle: ChannelLifecycle = 'absent';
    let channelSetupRunner: Promise<void> | null = null;
    let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
    let recoveryAttempt = 0;
    let recoveryRequested = false;
    let readPending = false;
    let readRevision = 0;
    let readRunner: Promise<void> | null = null;
    let authPending = false;
    let authKnown = false;
    let authRevision = 0;
    let authRunner: Promise<void> | null = null;
    let latestAccessToken: string | undefined;
    const intentionallyClosing = new Set<SessionRealtimeSubscription>();
    const removalPromises = new WeakMap<
      SessionRealtimeSubscription,
      Promise<void>
    >();

    const isCurrentEffect = () => !cleanupStarted && !terminal;
    const hasUsableChannel = () => registeredSubscription !== null
      && (
        channelLifecycle === 'subscribing'
        || channelLifecycle === 'subscribed'
        || channelLifecycle === 'retrying'
      );

    const clearRecoveryTimer = () => {
      if (!recoveryTimer) return;
      clearTimeout(recoveryTimer);
      recoveryTimer = null;
    };

    const removeSubscription = async (
      subscription: SessionRealtimeSubscription,
    ) => {
      intentionallyClosing.add(subscription);
      const pendingRemoval = removalPromises.get(subscription);
      if (pendingRemoval) return pendingRemoval;

      const removal = Promise.resolve(subscription.unsubscribe())
        .then(() => undefined)
        .finally(() => removalPromises.delete(subscription));
      removalPromises.set(subscription, removal);
      return removal;
    };

    const enterTerminalState = (snapshot: SessionStatusSnapshot) => {
      if (cleanupStarted || terminal) return;
      terminal = true;
      isClosedRef.current = true;
      recoveryRequested = false;
      clearRecoveryTimer();
      dispatch({ type: 'SESSION_UPDATED', snapshot });

      const current = registeredSubscription;
      registeredSubscription = null;
      channelLifecycle = 'closed';
      if (current) void removeSubscription(current);
    };

    const applyRealtimeAuth = (): Promise<void> => {
      if (!isCurrentEffect()) return Promise.resolve();
      authPending = true;
      if (authRunner) return authRunner;

      function startAuthRunner(): Promise<void> {
        const runner = (async () => {
          while (isCurrentEffect() && authPending) {
            authPending = false;

            if (!authKnown) {
              const observedRevision = authRevision;
              const token = await realtime.getAccessToken();
              if (!isCurrentEffect()) return;
              if (observedRevision === authRevision) {
                latestAccessToken = token;
                authKnown = true;
              } else {
                authPending = true;
              }
            }

            const appliedRevision = authRevision;
            await realtime.setAuth(latestAccessToken);
            if (!isCurrentEffect()) return;
            if (appliedRevision !== authRevision) authPending = true;
          }
        })().finally(() => {
          if (authRunner !== runner) return;
          authRunner = null;
          if (isCurrentEffect() && authPending) return startAuthRunner();
        });

        authRunner = runner;
        return runner;
      }

      return startAuthRunner();
    };

    const requestAuthoritativeRead = (): Promise<void> => {
      if (!isCurrentEffect()) return Promise.resolve();
      readRevision += 1;
      readPending = true;
      if (readRunner) return readRunner;

      function startReadRunner(): Promise<void> {
        const runner = (async () => {
          while (isCurrentEffect() && readPending) {
            readPending = false;
            const requestedRevision = readRevision;
            const result = await dependencies.getSessionStatus(sessionId);
            if (!isCurrentEffect()) return;
            if (requestedRevision !== readRevision) {
              readPending = true;
              continue;
            }
            if (!result.ok) {
              dispatch({ type: 'reconnecting' });
              continue;
            }
            if (result.snapshot.status === 'closed') {
              enterTerminalState(result.snapshot);
              return;
            }

            if (channelLifecycle === 'subscribed' && registeredSubscription) {
              dispatch({ type: 'SESSION_UPDATED', snapshot: result.snapshot });
            } else {
              dispatch({ type: 'snapshot_reconnecting', snapshot: result.snapshot });
            }
          }
        })().catch(() => {
          if (isCurrentEffect()) dispatch({ type: 'reconnecting' });
        }).finally(() => {
          if (readRunner !== runner) return;
          readRunner = null;
          if (isCurrentEffect() && readPending) void startReadRunner();
        });

        readRunner = runner;
        return runner;
      }

      return startReadRunner();
    };

    function requestChannelRecovery({
      immediate = false,
      restartBudget = false,
    }: {
      immediate?: boolean;
      restartBudget?: boolean;
    } = {}) {
      if (!isCurrentEffect()) return;
      if (hasUsableChannel()) {
        recoveryRequested = false;
        return;
      }
      if (restartBudget) recoveryAttempt = 0;
      recoveryRequested = true;
      if (channelSetupRunner) return;
      if (recoveryTimer) {
        if (!immediate) return;
        clearRecoveryTimer();
      }
      if (recoveryAttempt > CHANNEL_RECOVERY_BACKOFF_MS.length) {
        recoveryRequested = false;
        return;
      }

      const delay = immediate
        ? 0
        : CHANNEL_RECOVERY_BACKOFF_MS[Math.max(0, recoveryAttempt - 1)];
      if (delay === 0) {
        recoveryRequested = false;
        void startChannelReplacement();
        return;
      }

      recoveryTimer = setTimeout(() => {
        recoveryTimer = null;
        if (!isCurrentEffect()) return;
        recoveryRequested = false;
        void startChannelReplacement();
      }, delay);
    }

    function handlePayload(
      source: SessionRealtimeSubscription,
      payload: unknown,
    ) {
      if (
        !isCurrentEffect()
        || registeredSubscription !== source
        || channelLifecycle !== 'subscribed'
      ) return;

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
        if (snapshot.status === 'closed') enterTerminalState(snapshot);
        else dispatch({ type: 'SESSION_UPDATED', snapshot });
      } catch {
        dispatch({ type: 'reconnecting' });
        void requestAuthoritativeRead();
      }
    }

    function handleStatus(
      source: SessionRealtimeSubscription,
      status: SessionRealtimeStatus,
    ) {
      if (
        !isCurrentEffect()
        || intentionallyClosing.has(source)
        || registeredSubscription !== source
      ) return;

      if (status === 'SUBSCRIBED') {
        channelLifecycle = 'subscribed';
        recoveryAttempt = 0;
        dispatch({ type: 'reconnecting' });
        void requestAuthoritativeRead();
        return;
      }

      if (
        status === 'CLOSED'
        || status === 'CHANNEL_ERROR'
        || status === 'TIMED_OUT'
      ) {
        channelLifecycle = status === 'CLOSED' ? 'closed' : 'retrying';
        dispatch({ type: 'reconnecting' });
        void requestAuthoritativeRead();

        if (status === 'CLOSED') {
          requestChannelRecovery({ immediate: true, restartBudget: true });
        } else {
          channelLifecycle = 'closed';
          recoveryAttempt += 1;
          requestChannelRecovery();
        }
      }
    }

    function startChannelReplacement(): Promise<void> {
      if (!isCurrentEffect()) return Promise.resolve();
      if (channelSetupRunner) return channelSetupRunner;

      const runner = (async () => {
        channelLifecycle = 'recovering';
        dispatch({ type: 'reconnecting' });
        await applyRealtimeAuth();
        if (!isCurrentEffect()) return;

        const previous = registeredSubscription;
        if (previous) {
          await removeSubscription(previous);
          if (!isCurrentEffect()) return;
          if (registeredSubscription === previous) registeredSubscription = null;
          await applyRealtimeAuth();
          if (!isCurrentEffect()) return;
        }

        let nextSubscription: SessionRealtimeSubscription | null = null;
        const pendingCallbacks: Array<() => void> = [];
        const createdSubscription = realtime.subscribe(
          sessionId,
          (payload) => {
            if (nextSubscription) handlePayload(nextSubscription, payload);
            else pendingCallbacks.push(() => {
              if (nextSubscription) handlePayload(nextSubscription, payload);
            });
          },
          (status) => {
            if (nextSubscription) handleStatus(nextSubscription, status);
            else pendingCallbacks.push(() => {
              if (nextSubscription) handleStatus(nextSubscription, status);
            });
          },
        );
        nextSubscription = createdSubscription;
        registeredSubscription = createdSubscription;
        channelLifecycle = 'subscribing';
        recoveryRequested = false;
        pendingCallbacks.splice(0).forEach((callback) => callback());
      })().catch(() => {
        if (!isCurrentEffect()) return;
        channelLifecycle = 'closed';
        recoveryAttempt += 1;
        recoveryRequested = true;
        dispatch({ type: 'reconnecting' });
      }).finally(() => {
        if (channelSetupRunner === runner) channelSetupRunner = null;
        if (isCurrentEffect() && recoveryRequested && !hasUsableChannel()) {
          requestChannelRecovery();
        }
      });

      channelSetupRunner = runner;
      return runner;
    }

    const unsubscribeAuth = realtime.onTokenRefreshed((accessToken) => {
      if (!isCurrentEffect()) return;
      latestAccessToken = accessToken;
      authKnown = true;
      authRevision += 1;
      authPending = true;

      void applyRealtimeAuth().then(() => {
        if (!isCurrentEffect()) return;
        void requestAuthoritativeRead();
        if (!hasUsableChannel()) {
          requestChannelRecovery({ immediate: true, restartBudget: true });
        }
      }).catch(() => {
        if (!isCurrentEffect()) return;
        channelLifecycle = 'closed';
        dispatch({ type: 'reconnecting' });
        requestChannelRecovery();
      });
    });

    requestChannelRecovery({ immediate: true, restartBudget: true });

    const recoverAfterBrowserReturn = () => {
      if (!isCurrentEffect()) return;
      void requestAuthoritativeRead();
      if (!hasUsableChannel()) {
        requestChannelRecovery({ immediate: true, restartBudget: true });
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') recoverAfterBrowserReturn();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', recoverAfterBrowserReturn);
    window.addEventListener('pageshow', recoverAfterBrowserReturn);

    let cleanupInvoked = false;
    const cleanup = () => {
      if (cleanupInvoked) return;
      cleanupInvoked = true;
      cleanupStarted = true;
      recoveryRequested = false;
      readPending = false;
      authPending = false;
      clearRecoveryTimer();
      unsubscribeAuth();
      const current = registeredSubscription;
      registeredSubscription = null;
      channelLifecycle = 'closed';
      if (current) void removeSubscription(current);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', recoverAfterBrowserReturn);
      window.removeEventListener('pageshow', recoverAfterBrowserReturn);
    };
    const unregisterRoomCleanup = registerRoomCleanup(sessionId, cleanup);

    return () => {
      unregisterRoomCleanup();
      cleanup();
    };
  }, [dependencies, initialSnapshot.status, sessionId]);

  return { state, dispatch };
}
