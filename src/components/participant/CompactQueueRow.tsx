import { artistLabel, songTitleLabel, type ActiveQueueEntry } from '@/src/domain/queue.types';
import styles from './participant-neon.module.css';

export function CompactQueueRow({
  entry,
  displayPosition,
  isCurrentUser,
}: {
  entry: ActiveQueueEntry;
  displayPosition: number;
  isCurrentUser: boolean;
}) {
  const isPreparing = entry.status === 'preparing';
  return (
    <article className={styles.queueRow} data-status={entry.status}>
      <span className={styles.queueNumber} aria-label={`Posição ${displayPosition}`}>
        {String(displayPosition).padStart(2, '0')}
      </span>
      <div className={styles.queueCopy}>
        <div className={styles.personalTitle}>
          <span className={styles.queueTitle}>{songTitleLabel(entry)}</span>
          {isCurrentUser && <span className={styles.youBadge}>VOCÊ</span>}
        </div>
        <div className={styles.queueSub}>{artistLabel(entry)} · {entry.participantName}</div>
      </div>
      <span className={styles.statusBadge} data-status={entry.status}>
        <span aria-hidden="true">{isPreparing ? '◐' : '○'}</span>
        {isPreparing ? 'Preparando' : 'Aguardando'}
      </span>
    </article>
  );
}
