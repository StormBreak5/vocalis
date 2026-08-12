import { Music2 } from 'lucide-react';
import styles from './display.module.css';

export function DisplayEmptyState() {
  return (
    <section className={`${styles.surface} ${styles.emptyState}`} data-display-empty>
      <div>
        <span className={styles.emptyIcon}><Music2 aria-hidden="true" /></span>
        <h1>A fila está vazia</h1>
        <p>Compartilhe o código para começar a noite.</p>
      </div>
    </section>
  );
}
