import { ListMusic, RadioTower, Users } from 'lucide-react';
import type { Participant } from '@/src/domain/participant.types';
import { formatParticipantLabel } from '@/src/domain/participant.utils';
import styles from './dj-dashboard.module.css';

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('pt-BR'))
    .join('');
}

function joinedTime(joinedAt: string) {
  return new Date(joinedAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DjSessionMetrics({ queueCount, participantCount }: { queueCount: number; participantCount: number }) {
  return (
    <div className={styles.metrics} aria-label="Resumo da sessão">
      <article className={styles.metric}>
        <div className={styles.metricLabel}><span>Na fila</span><ListMusic size={18} aria-hidden="true" /></div>
        <div className={styles.metricValue}>{queueCount}</div>
      </article>
      <article className={styles.metric}>
        <div className={styles.metricLabel}><span>Na sala</span><Users size={18} aria-hidden="true" /></div>
        <div className={styles.metricValue}>{participantCount}</div>
      </article>
    </div>
  );
}

export function DjParticipantsPanel({ participants }: { participants: Participant[] }) {
  return (
    <section className={styles.card} aria-labelledby="dj-participants-title" data-testid="dj-participants-panel">
      <div className={styles.participantHeading}>
        <div><h2 id="dj-participants-title">Participantes</h2><p>Horário de entrada na sala</p></div>
        <span className={styles.count} aria-label={`${participants.length} participantes`}>{participants.length}</span>
      </div>
      {participants.length === 0 ? (
        <div className={styles.participantEmpty}>Ninguém entrou na sala ainda.</div>
      ) : (
        <ul className={styles.participantList}>
          {participants.map((participant) => {
            const label = formatParticipantLabel(participant.displayName, participant.disambiguationIndex);
            return (
              <li key={participant.id} className={styles.participantRow}>
                <span className={styles.avatar} aria-hidden="true">{initials(label)}</span>
                <div>
                  <div className={styles.participantName}>{label}</div>
                  <div className={styles.participantMeta}>Entrou na sala</div>
                </div>
                <time className={styles.joinedTime} dateTime={participant.joinedAt}>{joinedTime(participant.joinedAt)}</time>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function DjRealtimeNote() {
  return (
    <aside className={`${styles.card} ${styles.connectionNotice}`}>
      <RadioTower size={18} aria-hidden="true" />
      <div><strong>Atualizações em tempo real</strong><br />Fila, participantes e status são sincronizados sem polling.</div>
    </aside>
  );
}
