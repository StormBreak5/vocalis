import type { ReactNode } from 'react';
import foundation from './vocalis-neon-foundation.module.css';
import styles from './vocalis-marketing.module.css';

export function VocalisNeonShell({ children, variant }: { children: ReactNode; variant: 'home' | 'entry' | 'dj' }) {
  return (
    <main className={`${foundation.theme} ${styles.shell}`} data-vocalis-neon={variant}>
      <span className={styles.beam} aria-hidden="true" />
      <span className={styles.beamSecondary} aria-hidden="true" />
      <div className={styles.frame}>{children}</div>
    </main>
  );
}
