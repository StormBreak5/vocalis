import { CircleStop, MicVocal } from 'lucide-react';
import styles from './display.module.css';

export function DisplayClosedState() {
  return (
    <div className={styles.closedState} data-display-closed>
      <div className={styles.closedContent}>
        <div className={`${styles.brand} ${styles.closedBrand}`}>
          <span className={styles.brandMark}><MicVocal aria-hidden="true" /></span>
          <span>Vocalis</span>
        </div>
        <span className={styles.closedIcon}><CircleStop aria-hidden="true" /></span>
        <h1>Sala encerrada</h1>
        <p>Obrigado por cantar com a gente. Nenhuma informação da sessão permanece nesta tela.</p>
      </div>
    </div>
  );
}
