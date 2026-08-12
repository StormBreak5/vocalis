import { Sparkles } from 'lucide-react';
import type { ActiveQueueEntry } from '@/src/domain/queue.types';
import styles from './display.module.css';

export function DisplayNextUp({ entry }: { entry: ActiveQueueEntry | null }) {
  if (!entry) {
    return (
      <section className={`${styles.surface} ${styles.nextPanel}`} data-display-next-up>
        <span className={styles.nextIcon}><Sparkles aria-hidden="true" /></span>
        <div className={styles.nextCopy}>
          <div className={styles.nextLabel}>Próximo</div>
          <div className={styles.nextName}>Aguardando novos pedidos</div>
        </div>
        <div className={styles.nextState}>Fila livre</div>
      </section>
    );
  }

  const stateLabel = entry.status === 'preparing' ? 'Preparando' : 'Aguardando';

  return (
    <section className={`${styles.surface} ${styles.nextPanel}`} data-display-next-up>
      <span className={styles.nextIcon}><Sparkles aria-hidden="true" /></span>
      <div className={styles.nextCopy}>
        <div className={styles.nextLabel}>Próximo</div>
        <div className={styles.nextName}>{entry.participantName}</div>
        <div className={styles.nextTrack}>{entry.songTitle} · {entry.artist}</div>
      </div>
      <div className={styles.nextState}>{stateLabel}</div>
    </section>
  );
}
