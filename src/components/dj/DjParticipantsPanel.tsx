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
        <div className={styles.metricLabel}><span>Online</span><Users size={18} aria-hidden="true" /></div>
        <div className={styles.metricValue}>{participantCount}</div>
      </article>
    </div>
  );
}

export function DjParticipantsPanel({
  participants,
  onlineParticipantIds,
}: {
  participants: Participant[];
  onlineParticipantIds: ReadonlySet<string>;
}) {
  const orderedParticipants = [...participants].sort((a, b) => {
    const onlineDifference = Number(onlineParticipantIds.has(b.id)) - Number(onlineParticipantIds.has(a.id));
    return onlineDifference || a.joinedAt.localeCompare(b.joinedAt);
  });

  return (
    <section className={styles.card} aria-labelledby="dj-participants-title" data-testid="dj-participants-panel">
      <div className={styles.participantHeading}>
        <div><h2 id="dj-participants-title">Participantes</h2><p>{onlineParticipantIds.size} online · {participants.length} registrados</p></div>
        <span className={styles.count} aria-label={`${onlineParticipantIds.size} participantes online`}>{onlineParticipantIds.size}</span>
      </div>
      {participants.length === 0 ? (
        <div className={styles.participantEmpty}>Ninguém entrou na sala ainda.</div>
      ) : (
        <ul className={styles.participantList}>
          {orderedParticipants.map((participant) => {
            const label = formatParticipantLabel(participant.displayName, participant.disambiguationIndex);
            const isOnline = onlineParticipantIds.has(participant.id);
            return (
              <li key={participant.id} className={styles.participantRow} data-online={isOnline || undefined}>
                <span className={styles.avatar} aria-hidden="true">{initials(label)}</span>
                <div>
                  <div className={styles.participantName}>{label}</div>
                  <div className={styles.participantMeta} data-presence={isOnline ? 'online' : 'offline'}>
                    {isOnline ? 'Online' : 'Offline'}
                  </div>
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
