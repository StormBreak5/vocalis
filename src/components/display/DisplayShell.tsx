import type { ReactNode } from 'react';
import foundation from '@/src/components/vocalis/vocalis-neon-foundation.module.css';
import styles from './display.module.css';

export function DisplayShell({ children }: { children: ReactNode }) {
  return (
    <main
      className={`${foundation.theme} ${styles.screen}`}
      data-public-display
    >
      <span className={styles.decorativeGlow} aria-hidden="true" />
      <div className={styles.safeArea}>{children}</div>
    </main>
  );
}
