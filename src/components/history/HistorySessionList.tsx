import { ArrowLeft, History as HistoryIcon } from 'lucide-react';
import Link from 'next/link';
import { VocalisNeonShell } from '@/src/components/vocalis/VocalisNeonShell';
import { VocalisBrand } from '@/src/components/vocalis/VocalisBrand';
import type { HostSessionHistoryEntry } from '@/src/domain/session-history.types';
import { HistorySessionRow } from './HistorySessionRow';
import marketingStyles from '@/src/components/vocalis/vocalis-marketing.module.css';
import styles from '@/src/components/dj/dj-dashboard.module.css';

export function HistorySessionList({ sessions }: { sessions: HostSessionHistoryEntry[] }) {
  return (
    <VocalisNeonShell variant="entry">
      <section className={marketingStyles.entryTop}>
        <Link href="/" className={marketingStyles.backLink}>
          <ArrowLeft size={17} aria-hidden="true" />
          Voltar para o início
        </Link>
        <VocalisBrand compact linked />
        <div className={marketingStyles.entryIntro}>
          <h1>Histórico das sessões</h1>
          <p>Sessões que você criou, mais recentes primeiro, com o total de músicas cantadas e participantes de cada uma.</p>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="history-list-title" data-testid="history-session-list">
        <div className={styles.participantHeading}>
          <div>
            <h2 id="history-list-title">Sessões</h2>
            <p>{sessions.length} {sessions.length === 1 ? 'sessão' : 'sessões'}</p>
          </div>
          <span className={styles.count} aria-label={`${sessions.length} sessões`}>{sessions.length}</span>
        </div>
        {sessions.length === 0 ? (
          <div className={styles.participantEmpty}>
            <HistoryIcon size={22} aria-hidden="true" style={{ marginBottom: 8 }} />
            <div>Você ainda não criou nenhuma sessão.</div>
          </div>
        ) : (
          <ul className={styles.participantList} aria-label="Sessões anteriores">
            {sessions.map((session) => (
              <HistorySessionRow key={session.id} session={session} />
            ))}
          </ul>
        )}
      </section>
    </VocalisNeonShell>
  );
}
