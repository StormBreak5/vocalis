import { MicVocal, Radio } from 'lucide-react';
import { artistLabel, songTitleLabel, type ActiveQueueEntry } from '@/src/domain/queue.types';
import styles from './display.module.css';

export function DisplayNowSinging({ entry }: { entry: ActiveQueueEntry | null }) {
  if (!entry) {
    return (
      <section className={`${styles.surface} ${styles.nowPanel}`} data-display-waiting>
        <div className={styles.waitingNow}>
          <span className={styles.waitingIcon}><Radio aria-hidden="true" /></span>
          <div className={styles.waitingCopy}>
            <div className={styles.eyebrow}>Cantando agora</div>
            <h1 className={styles.waitingTitle}>Aguardando o DJ chamar</h1>
            <p>A próxima música já está pronta.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`${styles.surface} ${styles.nowPanel}`} data-display-now-singing>
      <div className={styles.eyebrow}><MicVocal size={24} aria-hidden="true" /> Cantando agora</div>
      <h1 className={styles.currentName}>{entry.participantName}</h1>
      <div className={styles.currentSong}>{songTitleLabel(entry)}</div>
      <div className={styles.currentArtist}>{artistLabel(entry)}</div>
    </section>
  );
}
