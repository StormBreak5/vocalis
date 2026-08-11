'use client';

import { useRef, useState } from 'react';
import { Tabs } from '@base-ui/react/tabs';
import { Loader2, PauseCircle, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import type { Participant } from '@/src/domain/participant.types';
import type { ActiveQueueEntry } from '@/src/domain/queue.types';
import { updateQueueStatusAction } from '@/src/application/queue/update-queue-status.action';
import { useSessionLifecycleContext } from '@/src/components/session/SessionLifecycleProvider';
import { useActiveQueue } from '@/src/hooks/useActiveQueue';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';
import { useSessionParticipants } from '@/src/hooks/useSessionParticipants';
import { DjSessionHeader, type DjConnectionState } from './DjSessionHeader';
import {
  DjCompactQueueList,
  DjNextQueueCard,
  DjNowSingingHero,
  DjOperationalDock,
} from './DjQueuePanels';
import {
  DjParticipantsPanel,
  DjRealtimeNote,
  DjSessionMetrics,
} from './DjParticipantsPanel';
import type {
  DjQueueActionHandler,
  DjQueueActionKind,
  DjQueueActionState,
} from './dj.types';
import styles from './dj-dashboard.module.css';

function OperationLoading() {
  return (
    <div className={`${styles.card} ${styles.loading}`} role="status">
      <Loader2 className={styles.spinner} size={28} aria-hidden="true" />
      <span>Carregando a fila…</span>
    </div>
  );
}

function ConnectionContext({ state }: { state: 'paused' | 'offline' | 'reconnecting' }) {
  const isPaused = state === 'paused';
  const copy = isPaused
    ? 'Novas entradas e pedidos estão pausados. As músicas existentes continuam operáveis.'
    : state === 'reconnecting'
      ? 'Reconectando. O estado exibido pode estar desatualizado e as ações estão bloqueadas.'
      : 'Sem conexão. O estado exibido pode estar desatualizado e as ações estão bloqueadas.';
  const Icon = isPaused ? PauseCircle : WifiOff;
  return <div id="dj-connection-explanation" className={styles.contextNotice} data-state={state} role="status"><Icon size={19} aria-hidden="true" /><span>{copy}</span></div>;
}

function QueueOperationStack({
  queue,
  isLoading,
  onAction,
  pendingAction,
  mutationsAllowed,
  dockTargetId,
}: {
  queue: ActiveQueueEntry[];
  isLoading: boolean;
  onAction: DjQueueActionHandler;
  pendingAction: DjQueueActionState | null;
  mutationsAllowed: boolean;
  dockTargetId?: string;
}) {
  if (isLoading) return <OperationLoading />;
  const singing = queue.find((entry) => entry.status === 'singing');
  const preparing = queue.find((entry) => entry.status === 'preparing');
  const waiting = queue.filter((entry) => entry.status === 'pending');
  return (
    <div className={styles.mobileStack}>
      <DjNowSingingHero
        entry={singing}
        queueHasItems={queue.length > 0}
        onAction={onAction}
        pendingAction={pendingAction}
        mutationsAllowed={mutationsAllowed}
      />
      {preparing && (
        <DjNextQueueCard
          entry={preparing}
          onAction={onAction}
          pendingAction={pendingAction}
          mutationsAllowed={mutationsAllowed}
          isDockTarget={preparing.id === dockTargetId}
        />
      )}
      <DjCompactQueueList
        entries={waiting}
        onAction={onAction}
        pendingAction={pendingAction}
        mutationsAllowed={mutationsAllowed}
        dockTargetId={dockTargetId}
      />
    </div>
  );
}

export function DjDashboardExperience({
  sessionId,
  roomCode,
  initialParticipants,
}: {
  sessionId: string;
  roomCode: string;
  initialParticipants: Participant[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const actionInFlightRef = useRef(false);
  const [pendingAction, setPendingAction] = useState<DjQueueActionState | null>(null);
  const lifecycle = useSessionLifecycleContext();
  const { queue, isLoading, isOffline: queueIsOffline, resync } = useActiveQueue(sessionId);
  const participants = useSessionParticipants(sessionId, initialParticipants);
  const { isOnline } = useOnlineStatus();

  const isOffline = !isOnline || queueIsOffline || lifecycle.phase === 'offline' || lifecycle.phase === 'error';
  const isReconnecting = !isOffline && (lifecycle.phase === 'reconnecting' || lifecycle.phase === 'loading');
  const connectionState: DjConnectionState = isOffline ? 'offline' : isReconnecting ? 'reconnecting' : 'live';
  const mutationsAllowed = lifecycle.writesAllowed && connectionState === 'live';
  const controlsDisabled = !mutationsAllowed || lifecycle.snapshot?.status === 'closed';
  const singing = queue.find((entry) => entry.status === 'singing');
  const preparing = queue.find((entry) => entry.status === 'preparing');
  const waiting = queue.filter((entry) => entry.status === 'pending');
  const dockEntry = singing ?? preparing ?? waiting[0];
  const hasDock = connectionState !== 'live' || Boolean(dockEntry);
  const contextState = connectionState !== 'live'
    ? connectionState
    : lifecycle.snapshot?.status === 'paused' ? 'paused' : null;

  const restoreOperationalFocus = (entryId: string) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const root = rootRef.current;
        if (!root) return;
        const entryControls = Array.from(root.querySelectorAll<HTMLElement>(`[data-dj-entry-id="${entryId}"] button:not(:disabled)`));
        const visibleEntryControl = entryControls.find((element) => element.offsetParent !== null);
        const fallback = Array.from(root.querySelectorAll<HTMLElement>('[data-dj-focus-fallback]'))
          .find((element) => element.offsetParent !== null);
        (visibleEntryControl ?? fallback)?.focus();
      });
    });
  };

  const handleQueueAction: DjQueueActionHandler = async (entry, nextStatus) => {
    if (!mutationsAllowed || actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setPendingAction({ entryId: entry.id, nextStatus });
    try {
      const result = await updateQueueStatusAction(entry.id, nextStatus as DjQueueActionKind);
      if (!result.ok) {
        toast.error('Erro ao atualizar status', { description: result.userMessage });
        return;
      }
      await resync();
    } catch {
      toast.error('Erro inesperado', { description: 'Tente novamente.' });
    } finally {
      actionInFlightRef.current = false;
      setPendingAction(null);
      restoreOperationalFocus(entry.id);
    }
  };

  return (
    <div ref={rootRef} className={styles.dashboard} data-dj-dashboard data-connection-state={connectionState}>
      <DjSessionHeader roomCode={roomCode} connectionState={connectionState} controlsDisabled={controlsDisabled} />
      <span className={styles.srAnnouncement} aria-live="polite">
        {pendingAction ? 'Atualizando a fila.' : 'Fila pronta para operação.'}
      </span>

      <div className={styles.layout}>
        <main className={styles.mainColumn} data-dj-focus-fallback tabIndex={-1}>
          <QueueOperationStack
            queue={queue}
            isLoading={isLoading}
            onAction={handleQueueAction}
            pendingAction={pendingAction}
            mutationsAllowed={mutationsAllowed}
          />
        </main>
        <aside className={styles.sidebar}>
          <DjSessionMetrics queueCount={queue.length} participantCount={participants.length} />
          <DjParticipantsPanel participants={participants} />
          <DjRealtimeNote />
        </aside>
      </div>

      <div className={styles.mobileExperience}>
        {contextState && <ConnectionContext state={contextState} />}
        <Tabs.Root className={styles.mobileTabs} defaultValue="queue">
          <Tabs.List className={styles.tabList} aria-label="Conteúdo do painel">
            <Tabs.Tab className={styles.tab} value="queue" data-dj-focus-fallback>Fila · {queue.length}</Tabs.Tab>
            <Tabs.Tab className={styles.tab} value="participants">Participantes · {participants.length}</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel className={styles.tabPanel} value="queue" keepMounted data-empty-dock={!hasDock || undefined}>
            <QueueOperationStack
              queue={queue}
              isLoading={isLoading}
              onAction={handleQueueAction}
              pendingAction={pendingAction}
              mutationsAllowed={mutationsAllowed}
              dockTargetId={dockEntry?.id}
            />
          </Tabs.Panel>
          <Tabs.Panel className={styles.tabPanel} value="participants" keepMounted data-empty-dock={!hasDock || undefined}>
            <DjSessionMetrics queueCount={queue.length} participantCount={participants.length} />
            <DjParticipantsPanel participants={participants} />
          </Tabs.Panel>
        </Tabs.Root>
        {hasDock && (
          <DjOperationalDock
            entry={dockEntry}
            onAction={handleQueueAction}
            pendingAction={pendingAction}
            mutationsAllowed={mutationsAllowed}
            connectionState={connectionState}
          />
        )}
      </div>
    </div>
  );
}
