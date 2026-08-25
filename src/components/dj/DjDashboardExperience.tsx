'use client';

import { useRef, useState } from 'react';
import { Tabs } from '@base-ui/react/tabs';
import { Loader2, PauseCircle, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import type { Participant } from '@/src/domain/participant.types';
import type { ActiveQueueEntry } from '@/src/domain/queue.types';
import type { PairedDisplaySummary } from '@/src/domain/display-pairing.types';
import { updateQueueStatusAction } from '@/src/application/queue/update-queue-status.action';
import { reorderQueueAction } from '@/src/application/queue/reorder-queue.action';
import { useSessionLifecycleContext } from '@/src/components/session/SessionLifecycleProvider';
import { useActiveQueue } from '@/src/hooks/useActiveQueue';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';
import { useSessionParticipants } from '@/src/hooks/useSessionParticipants';
import { useSessionPresence } from '@/src/hooks/useSessionPresence';
import { useDisplayPairings } from '@/src/hooks/useDisplayPairings';
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
import { DjDisplayPairingPanel } from './DjDisplayPairingPanel';
import type {
  DjQueueActionHandler,
  DjQueueActionKind,
  DjQueueActionState,
  DjQueueReorderHandler,
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
  onReorder,
  isReordering,
}: {
  queue: ActiveQueueEntry[];
  isLoading: boolean;
  onAction: DjQueueActionHandler;
  pendingAction: DjQueueActionState | null;
  mutationsAllowed: boolean;
  dockTargetId?: string;
  onReorder: DjQueueReorderHandler;
  isReordering: boolean;
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
        onReorder={onReorder}
        isReordering={isReordering}
      />
    </div>
  );
}

export function DjDashboardExperience({
  sessionId,
  roomCode,
  initialParticipants,
  initialPairedDisplays,
}: {
  sessionId: string;
  roomCode: string;
  initialParticipants: Participant[];
  initialPairedDisplays: PairedDisplaySummary[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  // Trava única para QUALQUER mutação de fila (mudança de status OU
  // reorder) — evita, por exemplo, o DJ apertar "Chamar" e arrastar quase
  // ao mesmo tempo, o que faria reorder_queue recusar com
  // INVALID_QUEUE_ORDER (o snapshot do Host ficou desatualizado no meio do
  // gesto) em vez de simplesmente esperar a primeira operação terminar.
  const actionInFlightRef = useRef(false);
  const [pendingAction, setPendingAction] = useState<DjQueueActionState | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const lifecycle = useSessionLifecycleContext();
  const { queue, isLoading, isOffline: queueIsOffline, resync } = useActiveQueue(sessionId);
  const participants = useSessionParticipants(sessionId, initialParticipants);
  const onlineParticipantIds = useSessionPresence(sessionId);
  const pairedDisplays = useDisplayPairings(sessionId, initialPairedDisplays);
  const onlineParticipantCount = participants.filter(({ id }) => onlineParticipantIds.has(id)).length;
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

  const handleReorder: DjQueueReorderHandler = async (orderedIds) => {
    if (!mutationsAllowed || actionInFlightRef.current) return false;
    actionInFlightRef.current = true;
    setIsReordering(true);
    try {
      const result = await reorderQueueAction(sessionId, orderedIds);
      if (!result.ok) {
        toast.error('Erro ao reordenar', { description: result.userMessage });
        return false;
      }
      await resync();
      return true;
    } catch {
      toast.error('Erro inesperado', { description: 'Tente novamente.' });
      return false;
    } finally {
      actionInFlightRef.current = false;
      setIsReordering(false);
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
            onReorder={handleReorder}
            isReordering={isReordering}
          />
        </main>
        <aside className={styles.sidebar}>
          <DjSessionMetrics queueCount={queue.length} participantCount={onlineParticipantCount} />
          <DjParticipantsPanel participants={participants} onlineParticipantIds={onlineParticipantIds} />
          <DjDisplayPairingPanel sessionId={sessionId} pairedDisplays={pairedDisplays} />
          <DjRealtimeNote />
        </aside>
      </div>

      <div className={styles.mobileExperience}>
        {contextState && <ConnectionContext state={contextState} />}
        <Tabs.Root className={styles.mobileTabs} defaultValue="queue">
          <Tabs.List className={styles.tabList} aria-label="Conteúdo do painel">
            <Tabs.Tab className={styles.tab} value="queue" data-dj-focus-fallback>Fila · {queue.length}</Tabs.Tab>
            <Tabs.Tab className={styles.tab} value="participants">Participantes · {onlineParticipantCount}</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel className={styles.tabPanel} value="queue" keepMounted data-empty-dock={!hasDock || undefined}>
            <QueueOperationStack
              queue={queue}
              isLoading={isLoading}
              onAction={handleQueueAction}
              pendingAction={pendingAction}
              mutationsAllowed={mutationsAllowed}
              onReorder={handleReorder}
              isReordering={isReordering}
              dockTargetId={dockEntry?.id}
            />
          </Tabs.Panel>
          <Tabs.Panel className={styles.tabPanel} value="participants" keepMounted data-empty-dock={!hasDock || undefined}>
            <DjSessionMetrics queueCount={queue.length} participantCount={onlineParticipantCount} />
            <DjParticipantsPanel participants={participants} onlineParticipantIds={onlineParticipantIds} />
            <DjDisplayPairingPanel sessionId={sessionId} pairedDisplays={pairedDisplays} />
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
