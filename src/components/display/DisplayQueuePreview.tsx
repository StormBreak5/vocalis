import type { ActiveQueueEntry } from '@/src/domain/queue.types';
import styles from './display.module.css';

export function DisplayQueuePreview({
  entries,
  remaining,
  total,
}: {
  entries: ActiveQueueEntry[];
  remaining: number;
  total: number;
}) {
  return (
    <section className={`${styles.surface} ${styles.queuePanel}`} data-display-queue-preview>
      <div className={styles.queueHeading}>
        <h2>Depois</h2>
        <span>{total} {total === 1 ? 'pessoa aguardando' : 'pessoas aguardando'}</span>
      </div>
      <ol className={styles.queueList}>
        {entries.map((entry) => (
          <li className={styles.queueRow} key={entry.id}>
            <span className={styles.queuePosition}>{String(entry.position).padStart(2, '0')}</span>
            <span className={styles.queuePerson}>{entry.participantName}</span>
            <span className={styles.queueTrack}>{entry.songTitle} · {entry.artist}</span>
          </li>
        ))}
      </ol>
      <div className={styles.queueMore}>{remaining > 0 ? `+${remaining} ainda na fila` : ''}</div>
    </section>
  );
}
