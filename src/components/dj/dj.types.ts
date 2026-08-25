import type { ActiveQueueEntry, QueueStatus } from '@/src/domain/queue.types';

export type DjQueueActionKind = Extract<QueueStatus, 'preparing' | 'singing' | 'completed' | 'cancelled'>;

export type DjQueueActionHandler = (
  entry: ActiveQueueEntry,
  nextStatus: DjQueueActionKind,
) => Promise<void>;

export interface DjQueueActionState {
  entryId: string;
  nextStatus: DjQueueActionKind;
}

// Retorna boolean (não void): DjCompactQueueList precisa saber se reverte o
// próprio estado otimista local quando o reorder falha no servidor.
export type DjQueueReorderHandler = (orderedIds: string[]) => Promise<boolean>;
