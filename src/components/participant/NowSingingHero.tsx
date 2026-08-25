import { Mic2 } from 'lucide-react';
import { artistLabel, songTitleLabel, type ActiveQueueEntry } from '@/src/domain/queue.types';
import styles from './participant-neon.module.css';

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'V';
}

export function NowSingingHero({ entry }: { entry?: ActiveQueueEntry }) {
  return (
    <section className={styles.hero} aria-labelledby="now-singing-title">
      <div className={styles.heroEyebrow}>
        <span className={styles.dot} aria-hidden="true" />
        <span id="now-singing-title">Cantando agora</span>
      </div>
      <div className={styles.heroMain}>
        <div className={styles.mic} aria-hidden="true"><Mic2 size={25} /></div>
        {entry ? (
          <div>
            <h1 className={styles.song}>{songTitleLabel(entry)}</h1>
            <div className={styles.artist}>{artistLabel(entry)}</div>
          </div>
        ) : (
          <div className={styles.stageWaiting}>
            <h1 className={styles.song}>Palco aguardando</h1>
            <div className={styles.artist}>O DJ ainda não iniciou a próxima música.</div>
          </div>
        )}
      </div>
      {entry && (
        <div className={styles.singer}>
          <span className={styles.avatar} aria-hidden="true">{initials(entry.participantName)}</span>
          <span>{entry.participantName} no microfone</span>
        </div>
      )}
    </section>
  );
}
