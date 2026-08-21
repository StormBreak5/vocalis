import { History } from 'lucide-react';
import type { HostSessionHistoryEntry } from '@/src/domain/session-history.types';
import styles from '@/src/components/dj/dj-dashboard.module.css';

const STATUS_LABEL: Record<HostSessionHistoryEntry['status'], string> = {
  active: 'Sessão ativa',
  paused: 'Fila pausada',
  closed: 'Sala encerrada',
};

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function HistorySessionRow({ session }: { session: HostSessionHistoryEntry }) {
  const dates = session.closedAt
    ? `Criada em ${formatSessionDate(session.createdAt)} · Encerrada em ${formatSessionDate(session.closedAt)}`
    : `Criada em ${formatSessionDate(session.createdAt)}`;

  return (
    <li className={styles.historyRow} data-testid="history-session-row">
      <span className={styles.avatar} aria-hidden="true"><History size={16} /></span>
      <div>
        <div className={styles.historyRowHead}>
          <span className={styles.historyRowCode}>{session.code}</span>
          <span className={styles.sessionStatus} data-state={session.status}>
            <span className={styles.statusDot} aria-hidden="true" />
            {STATUS_LABEL[session.status]}
          </span>
        </div>
        <div className={styles.historyRowDates}>{dates}</div>
      </div>
      <div className={styles.historyRowStats}>
        <div className={styles.historyStat}>
          <span className={styles.historyStatValue}>{session.songCount}</span>
          <span className={styles.historyStatLabel}>músicas</span>
        </div>
        <div className={styles.historyStat}>
          <span className={styles.historyStatValue}>{session.participantCount}</span>
          <span className={styles.historyStatLabel}>pessoas</span>
        </div>
      </div>
    </li>
  );
}
