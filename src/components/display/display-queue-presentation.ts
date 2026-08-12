import type { ActiveQueueEntry } from '@/src/domain/queue.types';

const ACTIVE_STATUSES = new Set(['pending', 'preparing', 'singing']);

export type DisplayQueuePresentation = {
  current: ActiveQueueEntry | null;
  next: ActiveQueueEntry | null;
  following: ActiveQueueEntry[];
};

export type DisplayQueueLimitInput = {
  viewportWidth: number;
  hasBanner?: boolean;
  hasLargeText?: boolean;
};

export function compareDisplayQueueEntries(
  left: ActiveQueueEntry,
  right: ActiveQueueEntry,
): number {
  return left.position - right.position
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id);
}

export function selectDisplayQueue(
  queue: ActiveQueueEntry[],
): DisplayQueuePresentation {
  const ordered = queue
    .filter((entry) => ACTIVE_STATUSES.has(entry.status))
    .slice()
    .sort(compareDisplayQueueEntries);

  const current = ordered.find((entry) => entry.status === 'singing') ?? null;
  const next = ordered.find((entry) => (
    entry.id !== current?.id && entry.status === 'preparing'
  )) ?? ordered.find((entry) => (
    entry.id !== current?.id && entry.status === 'pending'
  )) ?? null;
  const selectedIds = new Set([current?.id, next?.id].filter(Boolean));

  return {
    current,
    next,
    following: ordered.filter((entry) => !selectedIds.has(entry.id)),
  };
}

export function getDisplayQueueLimit({
  viewportWidth,
  hasBanner = false,
  hasLargeText = false,
}: DisplayQueueLimitInput): number {
  const resolutionLimit = viewportWidth >= 2_560
    ? 5
    : viewportWidth <= 1_366 ? 3 : 4;

  if (hasLargeText && hasBanner) {
    return Math.min(resolutionLimit, viewportWidth <= 1_366 ? 1 : 2);
  }
  if (hasLargeText) return Math.min(resolutionLimit, 2);
  if (hasBanner) {
    return Math.min(resolutionLimit, viewportWidth <= 1_366 ? 1 : 3);
  }
  return resolutionLimit;
}

export function limitDisplayQueue(
  entries: ActiveQueueEntry[],
  limit: number,
): { visible: ActiveQueueEntry[]; remaining: number } {
  const safeLimit = Math.max(0, Math.trunc(limit));
  return {
    visible: entries.slice(0, safeLimit),
    remaining: Math.max(0, entries.length - safeLimit),
  };
}

export function hasLargeDisplayText(
  presentation: DisplayQueuePresentation,
): boolean {
  const values = [
    presentation.current?.participantName,
    presentation.current?.songTitle,
    presentation.current?.artist,
    presentation.next?.participantName,
    presentation.next?.songTitle,
    presentation.next?.artist,
  ].filter((value): value is string => Boolean(value));

  return values.some((value) => Array.from(value).length > 54);
}
