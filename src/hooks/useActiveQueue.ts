'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { listActiveQueueAction } from '@/src/application/queue/list-active-queue.action';
import type { ActiveQueueEntry, QueueEntry } from '@/src/domain/queue.types';
import { createClient } from '@/src/infrastructure/supabase/client';
import type { Database } from '@/src/infrastructure/supabase/database.types';

type QueueRow = Database['public']['Tables']['queue']['Row'];
type QueueRealtimeStatus =
  | 'SUBSCRIBED'
  | 'CHANNEL_ERROR'
  | 'TIMED_OUT'
  | 'CLOSED'
  | string;
type ChannelLifecycle =
  | 'absent'
  | 'recovering'
  | 'subscribing'
  | 'subscribed'
  | 'retrying'
  | 'closed';

const ACTIVE_QUEUE_STATUSES = new Set(['pending', 'preparing', 'singing']);
const CHANNEL_RECOVERY_BACKOFF_MS = [250, 750, 1_500, 3_000] as const;

function orderQueue(entries: ActiveQueueEntry[]): ActiveQueueEntry[] {
  return [...entries].sort((left, right) =>
    left.position - right.position
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id));
}

function isQueueRow(value: unknown): value is QueueRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<QueueRow>;
  return typeof row.id === 'string'
    && typeof row.session_id === 'string'
    && typeof row.participant_id === 'string'
    && typeof row.song_title === 'string'
    && typeof row.artist === 'string'
    && typeof row.status === 'string'
    && typeof row.position === 'number'
    && typeof row.created_at === 'string'
    && typeof row.updated_at === 'string';
}

function mapQueueRow(row: QueueRow, participantName: string): ActiveQueueEntry {
  return {
    id: row.id,
    sessionId: row.session_id,
    participantId: row.participant_id,
    songTitle: row.song_title,
    artist: row.artist,
    status: row.status as QueueEntry['status'],
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    participantName,
  };
}

function isCompatibleQueue(entries: ActiveQueueEntry[], sessionId: string): boolean {
  const ids = new Set<string>();
  const activeParticipants = new Set<string>();

  for (const entry of entries) {
    if (entry.sessionId !== sessionId || ids.has(entry.id)) return false;
    if (!ACTIVE_QUEUE_STATUSES.has(entry.status)) return false;
    if (activeParticipants.has(entry.participantId)) return false;
    ids.add(entry.id);
    activeParticipants.add(entry.participantId);
  }

  return true;
}

export function useActiveQueue(sessionId: string) {
  const [queue, setQueue] = useState<ActiveQueueEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const queueRef = useRef<ActiveQueueEntry[]>([]);
  const mountedRef = useRef(false);
  const mountGenerationRef = useRef(0);
  const localRevisionRef = useRef(0);
  const requestedReadRef = useRef(0);
  const readPendingRef = useRef(false);
  const readRunnerRef = useRef<Promise<void> | null>(null);
  const failureNotifiedRef = useRef(false);
  const authoritativeReadHealthyRef = useRef(true);
  const realtimeUnavailableRef = useRef(false);
  const browserOnlineRef = useRef(true);

  const requestAuthoritativeRead = useCallback((showLoading: boolean) => {
    if (!mountedRef.current) return Promise.resolve();

    if (showLoading) setIsLoading(true);
    requestedReadRef.current += 1;
    readPendingRef.current = true;

    if (readRunnerRef.current) return readRunnerRef.current;

    const generation = mountGenerationRef.current;

    function startReadRunner(): Promise<void> {
      const runner = (async () => {
        while (
          mountedRef.current
          && mountGenerationRef.current === generation
          && readPendingRef.current
        ) {
          readPendingRef.current = false;
          const requestedRead = requestedReadRef.current;
          const localRevision = localRevisionRef.current;

          try {
            const response = await listActiveQueueAction(sessionId);
            if (!mountedRef.current || mountGenerationRef.current !== generation) return;

            const isStale = requestedRead !== requestedReadRef.current
              || localRevision !== localRevisionRef.current;
            if (isStale) {
              readPendingRef.current = true;
              continue;
            }

            if (response.ok) {
              const authoritativeQueue = orderQueue(response.queue);
              queueRef.current = authoritativeQueue;
              setQueue(authoritativeQueue);
              setIsOffline(
                !browserOnlineRef.current || realtimeUnavailableRef.current,
              );
              authoritativeReadHealthyRef.current = true;
              if (!realtimeUnavailableRef.current) failureNotifiedRef.current = false;
            } else {
              setIsOffline(true);
              authoritativeReadHealthyRef.current = false;
              if (!failureNotifiedRef.current) {
                failureNotifiedRef.current = true;
                toast.error('Erro ao carregar fila', {
                  description: response.userMessage,
                });
              }
            }
          } catch {
            if (!mountedRef.current || mountGenerationRef.current !== generation) return;

            const isStale = requestedRead !== requestedReadRef.current
              || localRevision !== localRevisionRef.current;
            if (isStale) {
              readPendingRef.current = true;
              continue;
            }

            setIsOffline(true);
            authoritativeReadHealthyRef.current = false;
            if (!failureNotifiedRef.current) {
              failureNotifiedRef.current = true;
              toast.error('Erro de conexão', {
                description: 'Você parece estar offline.',
              });
            }
          }
        }
      })().finally(() => {
        if (readRunnerRef.current !== runner) return;
        readRunnerRef.current = null;

        // Uma solicitação pode chegar depois da última condição do laço,
        // mas antes deste finalizador. Nesse caso, um novo runner precisa drená-la.
        if (
          mountedRef.current
          && mountGenerationRef.current === generation
          && readPendingRef.current
        ) {
          void startReadRunner();
          return;
        }

        if (mountedRef.current && mountGenerationRef.current === generation) {
          setIsLoading(false);
        }
      });

      readRunnerRef.current = runner;
      return runner;
    }

    return startReadRunner();
  }, [sessionId]);

  const refresh = useCallback(
    () => requestAuthoritativeRead(true),
    [requestAuthoritativeRead],
  );
  const resync = useCallback(
    () => requestAuthoritativeRead(false),
    [requestAuthoritativeRead],
  );

  useEffect(() => {
    mountedRef.current = true;
    mountGenerationRef.current += 1;
    const generation = mountGenerationRef.current;
    browserOnlineRef.current = navigator.onLine;
    realtimeUnavailableRef.current = false;

    const supabase = createClient();
    let registeredChannel: RealtimeChannel | null = null;
    let channelLifecycle: ChannelLifecycle = 'absent';
    let channelSetupRunner: Promise<void> | null = null;
    let authRunner: Promise<void> | null = null;
    let authPending = false;
    let authKnown = false;
    let latestAccessToken: string | undefined;
    let authRevision = 0;
    let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
    let recoveryAttempt = 0;
    let recoveryRequested = false;
    let cleanupStarted = false;
    const intentionallyClosing = new WeakSet<RealtimeChannel>();
    const subscribedChannels = new WeakSet<RealtimeChannel>();
    const removalPromises = new WeakMap<RealtimeChannel, Promise<unknown>>();

    queueMicrotask(() => {
      if (!cleanupStarted && mountGenerationRef.current === generation) void refresh();
    });

    const isCurrentEffect = () => !cleanupStarted
      && mountedRef.current
      && mountGenerationRef.current === generation;

    const scheduleResync = () => {
      if (isCurrentEffect()) void resync();
    };

    const notifyChannelFailure = () => {
      if (!isCurrentEffect() || failureNotifiedRef.current) return;
      failureNotifiedRef.current = true;
      toast.error('Erro de conexão', {
        description: 'Não foi possível recuperar as atualizações da fila.',
      });
    };

    const hasUsableRegisteredChannel = () => registeredChannel !== null
      && (
        channelLifecycle === 'subscribing'
        || channelLifecycle === 'subscribed'
        || channelLifecycle === 'retrying'
      );

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
              const {
                data: { session },
              } = await supabase.auth.getSession();
              if (!isCurrentEffect()) return;

              if (observedRevision === authRevision) {
                latestAccessToken = session?.access_token;
                authKnown = true;
              } else {
                authPending = true;
              }
            }

            const appliedRevision = authRevision;
            if (latestAccessToken) {
              await supabase.realtime.setAuth(latestAccessToken);
            } else {
              await supabase.realtime.setAuth();
            }
            if (appliedRevision !== authRevision) authPending = true;
          }
        })().finally(() => {
          if (authRunner !== runner) return;
          authRunner = null;

          if (isCurrentEffect() && authPending) {
            return startAuthRunner();
          }
        });

        authRunner = runner;
        return runner;
      }

      return startAuthRunner();
    };

    const removeRegisteredChannel = (channel: RealtimeChannel): Promise<unknown> => {
      intentionallyClosing.add(channel);
      const pendingRemoval = removalPromises.get(channel);
      if (pendingRemoval) return pendingRemoval;

      const removal = Promise.resolve(supabase.removeChannel(channel)).finally(() => {
        removalPromises.delete(channel);
      });
      removalPromises.set(channel, removal);
      return removal;
    };

    const applyRealtimeQueue = (nextQueue: ActiveQueueEntry[]) => {
      if (!isCurrentEffect()) return;
      const orderedQueue = orderQueue(nextQueue);
      if (!isCompatibleQueue(orderedQueue, sessionId)) {
        scheduleResync();
        return;
      }

      localRevisionRef.current += 1;
      queueRef.current = orderedQueue;
      setQueue(orderedQueue);

      if (readRunnerRef.current) scheduleResync();
    };

    const handlePayload = (payload: unknown) => {
      if (!isCurrentEffect() || !payload || typeof payload !== 'object') return;
      const event = payload as {
        eventType?: string;
        new?: unknown;
        old?: { id?: unknown };
      };

      if (event.eventType === 'INSERT') {
        scheduleResync();
        return;
      }

      if (event.eventType === 'UPDATE') {
        if (!isQueueRow(event.new) || event.new.session_id !== sessionId) {
          scheduleResync();
          return;
        }
        const nextRow = event.new;

        const current = queueRef.current;
        const existing = current.find((item) => item.id === nextRow.id);
        if (!existing || existing.participantId !== nextRow.participant_id) {
          scheduleResync();
          return;
        }

        if (!ACTIVE_QUEUE_STATUSES.has(nextRow.status)) {
          if (nextRow.status === 'completed' || nextRow.status === 'cancelled') {
            applyRealtimeQueue(current.filter((item) => item.id !== nextRow.id));
          } else {
            scheduleResync();
          }
          return;
        }

        applyRealtimeQueue(current.map((item) => item.id === nextRow.id
          ? mapQueueRow(nextRow, item.participantName)
          : item));
        return;
      }

      if (event.eventType === 'DELETE') {
        const deletedId = event.old?.id;
        if (typeof deletedId !== 'string') {
          scheduleResync();
          return;
        }

        const current = queueRef.current;
        if (!current.some((item) => item.id === deletedId)) {
          scheduleResync();
          return;
        }
        applyRealtimeQueue(current.filter((item) => item.id !== deletedId));
        return;
      }

      scheduleResync();
    };

    function requestChannelRecovery({
      immediate = false,
      restartBudget = false,
    }: {
      immediate?: boolean;
      restartBudget?: boolean;
    } = {}) {
      if (!isCurrentEffect()) return;
      if (hasUsableRegisteredChannel()) {
        recoveryRequested = false;
        return;
      }

      if (restartBudget) recoveryAttempt = 0;
      recoveryRequested = true;

      if (channelSetupRunner) return;
      if (recoveryTimer) {
        if (!immediate) return;
        clearTimeout(recoveryTimer);
        recoveryTimer = null;
      }

      if (recoveryAttempt > CHANNEL_RECOVERY_BACKOFF_MS.length) {
        recoveryRequested = false;
        notifyChannelFailure();
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

    function handleChannelStatus(source: RealtimeChannel, status: QueueRealtimeStatus) {
      if (
        cleanupStarted
        || intentionallyClosing.has(source)
        || !isCurrentEffect()
        || registeredChannel !== source
      ) {
        return;
      }

      if (status === 'SUBSCRIBED') {
        subscribedChannels.add(source);
        channelLifecycle = 'subscribed';
        realtimeUnavailableRef.current = false;
        recoveryAttempt = 0;
        if (authoritativeReadHealthyRef.current) failureNotifiedRef.current = false;
        scheduleResync();
        return;
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        channelLifecycle = 'retrying';
        realtimeUnavailableRef.current = true;
        setIsOffline(true);
        scheduleResync();
        return;
      }

      if (status === 'CLOSED') {
        const wasSubscribed = subscribedChannels.has(source);
        channelLifecycle = 'closed';
        realtimeUnavailableRef.current = true;
        setIsOffline(true);
        scheduleResync();

        if (wasSubscribed) {
          requestChannelRecovery({ immediate: true, restartBudget: true });
        } else {
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
        await applyRealtimeAuth();
        if (!isCurrentEffect()) return;

        const previousChannel = registeredChannel;
        if (previousChannel) {
          await removeRegisteredChannel(previousChannel);
          if (!isCurrentEffect()) return;
          if (registeredChannel === previousChannel) registeredChannel = null;
        }

        // A autenticação pode ter sido renovada enquanto o canal anterior era removido.
        await applyRealtimeAuth();
        if (!isCurrentEffect()) return;

        const nextChannel = supabase.channel(
          `queue:${sessionId}:${crypto.randomUUID()}`,
        );
        registeredChannel = nextChannel;
        channelLifecycle = 'subscribing';
        nextChannel
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'queue',
              filter: `session_id=eq.${sessionId}`,
            },
            handlePayload,
          )
          .subscribe((status: string) => handleChannelStatus(nextChannel, status));
        recoveryRequested = false;
      })().catch(() => {
        if (!isCurrentEffect()) return;
        channelLifecycle = 'closed';
        realtimeUnavailableRef.current = true;
        setIsOffline(true);
        recoveryAttempt += 1;
        recoveryRequested = true;
        notifyChannelFailure();
      }).finally(() => {
        if (channelSetupRunner === runner) channelSetupRunner = null;
        if (!isCurrentEffect()) return;
        if (recoveryRequested && !hasUsableRegisteredChannel()) {
          requestChannelRecovery();
        }
      });

      channelSetupRunner = runner;
      return runner;
    }

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'TOKEN_REFRESHED' || !isCurrentEffect()) return;

      latestAccessToken = session?.access_token;
      authKnown = true;
      authRevision += 1;
      authPending = true;

      void applyRealtimeAuth()
        .then(() => {
          if (!isCurrentEffect()) return;
          scheduleResync();
          if (!hasUsableRegisteredChannel()) {
            requestChannelRecovery({ immediate: true, restartBudget: true });
          }
        })
        .catch(() => {
          if (!isCurrentEffect()) return;
          realtimeUnavailableRef.current = true;
          setIsOffline(true);
          scheduleResync();
          notifyChannelFailure();
          if (!hasUsableRegisteredChannel()) requestChannelRecovery();
        });
    });

    requestChannelRecovery({ immediate: true, restartBudget: true });

    const recoverAfterBrowserReturn = () => {
      scheduleResync();
      if (!hasUsableRegisteredChannel()) {
        requestChannelRecovery({ immediate: true, restartBudget: true });
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') recoverAfterBrowserReturn();
    };
    const handleOnline = () => {
      browserOnlineRef.current = true;
      recoverAfterBrowserReturn();
    };
    const handleOffline = () => {
      browserOnlineRef.current = false;
      if (isCurrentEffect()) setIsOffline(true);
    };
    const handlePageShow = () => recoverAfterBrowserReturn();

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      cleanupStarted = true;
      mountedRef.current = false;
      mountGenerationRef.current += 1;
      requestedReadRef.current += 1;
      readPendingRef.current = false;
      readRunnerRef.current = null;
      recoveryRequested = false;
      if (recoveryTimer) {
        clearTimeout(recoveryTimer);
        recoveryTimer = null;
      }
      authSubscription.unsubscribe();
      if (registeredChannel) void removeRegisteredChannel(registeredChannel);
      registeredChannel = null;
      channelLifecycle = 'closed';
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [refresh, resync, sessionId]);

  return { queue, isLoading, isOffline, refresh, resync };
}
