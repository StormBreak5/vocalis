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
