'use client';

import { useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AudioLines,
  CheckCircle2,
  GripVertical,
  Headphones,
  ListMusic,
  Loader2,
  Megaphone,
  MicOff,
  Play,
  SkipForward,
  WifiOff,
} from 'lucide-react';
import { artistLabel, songTitleLabel, type ActiveQueueEntry } from '@/src/domain/queue.types';
import type {
  DjQueueActionHandler,
  DjQueueActionKind,
  DjQueueActionState,
  DjQueueReorderHandler,
} from './dj.types';
import styles from './dj-dashboard.module.css';

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('pt-BR'))
    .join('');
}

function actionFor(entry: ActiveQueueEntry): {
  label: string;
  loadingLabel: string;
  nextStatus: DjQueueActionKind;
  Icon: typeof Play;
} {
  if (entry.status === 'pending') {
    return { label: 'Chamar', loadingLabel: 'Chamando…', nextStatus: 'preparing', Icon: Megaphone };
  }
  if (entry.status === 'preparing') {
    return { label: 'Iniciar', loadingLabel: 'Iniciando…', nextStatus: 'singing', Icon: Play };
  }
  return { label: 'Finalizar', loadingLabel: 'Finalizando…', nextStatus: 'completed', Icon: CheckCircle2 };
}

export function DjQueueActions({
  entry,
  onAction,
  pendingAction,
  mutationsAllowed,
  primaryKind = 'primary',
}: {
  entry: ActiveQueueEntry;
  onAction: DjQueueActionHandler;
  pendingAction: DjQueueActionState | null;
  mutationsAllowed: boolean;
  primaryKind?: 'primary' | 'secondary';
}) {
  const primary = actionFor(entry);
  const isBusy = pendingAction?.entryId === entry.id;
  const controlsLocked = !mutationsAllowed || pendingAction !== null;
  const primaryBusy = isBusy && pendingAction.nextStatus === primary.nextStatus;
  const skipBusy = isBusy && pendingAction.nextStatus === 'cancelled';

  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={styles.queueAction}
        data-kind={primaryKind}
        data-dj-entry-action={primary.nextStatus}
        onClick={() => void onAction(entry, primary.nextStatus)}
        disabled={controlsLocked}
        aria-busy={primaryBusy}
        aria-label={`${primary.label} ${entry.participantName}`}
        title={!mutationsAllowed ? 'Ação indisponível enquanto o painel está sem conexão.' : undefined}
      >
        {primaryBusy ? <Loader2 className={styles.spinner} size={17} aria-hidden="true" /> : <primary.Icon size={17} aria-hidden="true" />}
        <span>{primaryBusy ? primary.loadingLabel : primary.label}</span>
      </button>
      <button
        type="button"
        className={styles.skipAction}
        data-dj-entry-action="cancelled"
        onClick={() => void onAction(entry, 'cancelled')}
        disabled={controlsLocked}
        aria-busy={skipBusy}
        aria-label={`Pular ${entry.participantName}`}
        title={!mutationsAllowed ? 'Ação indisponível enquanto o painel está sem conexão.' : undefined}
      >
        {skipBusy ? <Loader2 className={styles.spinner} size={17} aria-hidden="true" /> : <SkipForward size={17} aria-hidden="true" />}
        <span>{skipBusy ? 'Pulando…' : 'Pular'}</span>
      </button>
    </div>
  );
}

export function DjNowSingingHero({
  entry,
  queueHasItems,
  onAction,
  pendingAction,
  mutationsAllowed,
}: {
  entry?: ActiveQueueEntry;
  queueHasItems: boolean;
  onAction: DjQueueActionHandler;
  pendingAction: DjQueueActionState | null;
  mutationsAllowed: boolean;
}) {
  if (!entry) {
    return (
      <article className={`${styles.card} ${styles.emptyHero}`} data-testid="dj-empty-stage">
        <span className={styles.emptyHeroIcon}><MicOff size={26} aria-hidden="true" /></span>
        <span className={styles.eyebrow}>Palco livre</span>
        <h1>{queueHasItems ? 'Ninguém está cantando' : 'A fila está vazia'}</h1>
        <p>{queueHasItems ? 'Chame o próximo participante para continuar.' : 'Os novos pedidos aparecerão aqui em tempo real.'}</p>
      </article>
    );
  }

  return (
    <article className={`${styles.card} ${styles.hero}`} data-testid="dj-now-singing" data-dj-entry-id={entry.id}>
      <div className={styles.eyebrow}><AudioLines size={16} aria-hidden="true" />Cantando agora</div>
      <div className={styles.heroCopy}>
        <h1 className={styles.heroTitle}>{songTitleLabel(entry)}</h1>
        <p className={styles.heroArtist}>{artistLabel(entry)}</p>
      </div>
      <div className={styles.heroSinger}>
        <span className={styles.avatar} aria-hidden="true">{initials(entry.participantName)}</span>
        <span><span className={styles.singerLabel}>No microfone</span><span className={styles.singerName}>{entry.participantName}</span></span>
      </div>
      <div className={styles.heroActions}>
        <DjQueueActions
          entry={entry}
          onAction={onAction}
          pendingAction={pendingAction}
          mutationsAllowed={mutationsAllowed}
        />
      </div>
    </article>
  );
}

export function DjNextQueueCard({
  entry,
  onAction,
  pendingAction,
  mutationsAllowed,
  isDockTarget,
}: {
  entry: ActiveQueueEntry;
  onAction: DjQueueActionHandler;
  pendingAction: DjQueueActionState | null;
  mutationsAllowed: boolean;
  isDockTarget: boolean;
}) {
  return (
    <article className={styles.nextCard} data-testid="dj-next-preparing" data-dj-entry-id={entry.id} data-dock-target={isDockTarget || undefined}>
      <span className={styles.nextIcon}><Headphones size={21} aria-hidden="true" /></span>
      <div className={styles.itemCopy}>
        <div className={styles.itemLabel}>Preparando · próxima</div>
        <div className={styles.itemTitle}>{songTitleLabel(entry)}</div>
        <div className={styles.itemMeta}>{artistLabel(entry)} · {entry.participantName}</div>
      </div>
      <DjQueueActions
        entry={entry}
        onAction={onAction}
        pendingAction={pendingAction}
        mutationsAllowed={mutationsAllowed}
      />
    </article>
  );
}

function DjQueueRow({
  entry,
  onAction,
  pendingAction,
  mutationsAllowed,
  dockTargetId,
  dragDisabled,
}: {
  entry: ActiveQueueEntry;
  onAction: DjQueueActionHandler;
  pendingAction: DjQueueActionState | null;
  mutationsAllowed: boolean;
  dockTargetId?: string;
  dragDisabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: entry.id,
    disabled: dragDisabled,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={styles.queueRow}
      data-dj-entry-id={entry.id}
      data-dock-target={entry.id === dockTargetId || undefined}
    >
      <button
        type="button"
        className={styles.dragHandle}
        disabled={dragDisabled}
        aria-label={`Reordenar ${songTitleLabel(entry)} na fila`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={18} aria-hidden="true" />
      </button>
      <span className={styles.queueNumber}>{String(entry.position).padStart(2, '0')}</span>
      <div className={styles.itemCopy}>
        <div className={styles.itemTitle}>{songTitleLabel(entry)}</div>
        <div className={styles.itemMeta}>{artistLabel(entry)} · {entry.participantName}</div>
      </div>
      <DjQueueActions
        entry={entry}
        onAction={onAction}
        pendingAction={pendingAction}
        mutationsAllowed={mutationsAllowed}
        primaryKind="secondary"
      />
    </li>
  );
}

export function DjCompactQueueList({
  entries,
  onAction,
  pendingAction,
  mutationsAllowed,
  dockTargetId,
  onReorder,
  isReordering,
}: {
  entries: ActiveQueueEntry[];
  onAction: DjQueueActionHandler;
  pendingAction: DjQueueActionState | null;
  mutationsAllowed: boolean;
  dockTargetId?: string;
  onReorder: DjQueueReorderHandler;
  isReordering: boolean;
}) {
  // Reordenar via arraste precisa de feedback visual instantâneo — antes da
  // RPC confirmar — mas useActiveQueue não expõe setter para mutar `queue`
  // localmente. Este estado é só o "preview" otimista da ordem, dono deste
  // componente; a verdade sempre volta a ser `entries` (via Realtime/resync)
  // assim que a operação termina, com sucesso ou não.
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const serverIds = entries.map((entry) => entry.id).join(',');

  // "Adjusting state when a prop changes", feito durante a renderização em
  // vez de useEffect (padrão recomendado pelo React — evita o cascading
  // render de um setState síncrono dentro de efeito). O setState aqui é
  // guardado pela comparação serverIds !== syncedServerIds, então roda no
  // máximo uma vez por mudança real, nunca em loop.
  const [syncedServerIds, setSyncedServerIds] = useState(serverIds);
  if (serverIds !== syncedServerIds) {
    setSyncedServerIds(serverIds);
    if (localOrder) {
      const ids = serverIds.split(',').filter(Boolean);
      // O conjunto de ids do servidor mudou (entrada cancelada, chamada, ou
      // nova chegou) enquanto o preview local estava ativo — ele não é mais
      // válido, volta a refletir o servidor.
      if (localOrder.length !== ids.length || !localOrder.every((id) => ids.includes(id))) {
        setLocalOrder(null);
      }
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const orderedEntries = localOrder
    ? localOrder
        .map((id) => entries.find((entry) => entry.id === id))
        .filter((entry): entry is ActiveQueueEntry => Boolean(entry))
    : entries;

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const currentIds = localOrder ?? entries.map((entry) => entry.id);
    const oldIndex = currentIds.indexOf(String(active.id));
    const newIndex = currentIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const nextOrder = arrayMove(currentIds, oldIndex, newIndex);
    setLocalOrder(nextOrder);
    const ok = await onReorder(nextOrder);
    if (!ok) setLocalOrder(null);
  };

  const dragDisabled = !mutationsAllowed || isReordering || entries.length < 2;

  return (
    <section className={styles.card} aria-labelledby="dj-waiting-title" data-testid="dj-waiting-queue">
      <div className={styles.headingRow}>
        <div><h2 id="dj-waiting-title">Fila aguardando</h2><p>Pedidos em ordem de chegada</p></div>
        <span className={styles.count} aria-label={`${entries.length} aguardando`}>{entries.length}</span>
      </div>
      {entries.length === 0 ? (
        <div className={styles.emptyState}><ListMusic size={27} aria-hidden="true" /><strong>Ninguém aguardando</strong><span>Novos pedidos aparecerão automaticamente.</span></div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void handleDragEnd(event)}>
          <SortableContext items={orderedEntries.map((entry) => entry.id)} strategy={verticalListSortingStrategy}>
            <ol className={styles.queueList}>
              {orderedEntries.map((entry) => (
                <DjQueueRow
                  key={entry.id}
                  entry={entry}
                  onAction={onAction}
                  pendingAction={pendingAction}
                  mutationsAllowed={mutationsAllowed}
                  dockTargetId={dockTargetId}
                  dragDisabled={dragDisabled}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}

export function DjOperationalDock({
  entry,
  onAction,
  pendingAction,
  mutationsAllowed,
  connectionState,
}: {
  entry?: ActiveQueueEntry;
  onAction: DjQueueActionHandler;
  pendingAction: DjQueueActionState | null;
  mutationsAllowed: boolean;
  connectionState: 'live' | 'offline' | 'reconnecting';
}) {
  if (connectionState !== 'live') {
    return (
      <div className={styles.dock} data-testid="dj-operational-dock">
        <div className={styles.dockInfo} role="status"><WifiOff size={20} aria-hidden="true" />{connectionState === 'reconnecting' ? 'Reconectando — ações indisponíveis' : 'Sem conexão — ações indisponíveis'}</div>
      </div>
    );
  }
  if (!entry) return null;
  return (
    <div className={styles.dock} data-testid="dj-operational-dock" data-dj-entry-id={entry.id}>
      <DjQueueActions
        entry={entry}
        onAction={onAction}
        pendingAction={pendingAction}
        mutationsAllowed={mutationsAllowed}
      />
    </div>
  );
}
