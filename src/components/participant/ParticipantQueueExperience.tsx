'use client';

import { Loader2 } from 'lucide-react';
import { useSessionLifecycleContext } from '@/src/components/session/SessionLifecycleProvider';
import type { Participant } from '@/src/domain/participant.types';
import { useActiveQueue } from '@/src/hooks/useActiveQueue';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';
import { CompactQueueRow } from './CompactQueueRow';
import { NowSingingHero } from './NowSingingHero';
import { ParticipantCompactHeader } from './ParticipantCompactHeader';
import { ParticipantQueueCard } from './ParticipantQueueCard';
import { RequestMusicSheet } from './RequestMusicSheet';
import { SessionContextStrip, type SessionContextState } from './SessionContextStrip';
import type { ConnectionVisualState } from './ConnectionStatusPill';
import type { ParticipantDockContext } from './ParticipantActionDock';
import styles from './participant-neon.module.css';
import foundation from '@/src/components/vocalis/vocalis-neon-foundation.module.css';
import './participant-global.module.css';

export function ParticipantQueueExperience({
  sessionId,
  roomCode,
  participant,
}: {
  sessionId: string;
  roomCode: string;
  participant: Participant;
}) {
  const lifecycle = useSessionLifecycleContext();
  const { queue, isLoading, isOffline: queueIsOffline } = useActiveQueue(sessionId);
  const { isOnline } = useOnlineStatus();
  const sessionStatus = lifecycle.snapshot?.status;
  const isOffline = !isOnline || queueIsOffline || lifecycle.phase === 'offline' || lifecycle.phase === 'error';
  const isReconnecting = !isOffline && (lifecycle.phase === 'reconnecting' || lifecycle.phase === 'loading');

  const singingEntry = queue.find((entry) => entry.status === 'singing');
  const participantEntry = queue.find((entry) => entry.participantId === participant.id);
  const participantPosition = participantEntry ? queue.findIndex((entry) => entry.id === participantEntry.id) + 1 : undefined;
  const upcoming = queue.filter((entry) => entry.status !== 'singing' && entry.id !== participantEntry?.id);

  let connectionState: ConnectionVisualState = 'live';
  if (isOffline) connectionState = 'offline';
  else if (isReconnecting) connectionState = 'reconnecting';
  else if (sessionStatus === 'paused') connectionState = 'paused';

  let contextState: SessionContextState | undefined;
  if (isOffline) contextState = 'offline';
  else if (isReconnecting) contextState = 'reconnecting';
  else if (sessionStatus === 'paused') contextState = 'paused';

  let dockContext: ParticipantDockContext = participantEntry ? 'queued' : 'request';
  if (sessionStatus === 'closed') dockContext = 'closed';
  else if (isOffline) dockContext = 'offline';
  else if (isReconnecting) dockContext = 'reconnecting';
  else if (sessionStatus === 'paused') dockContext = 'paused';

  return (
    <main className={`${foundation.theme} ${styles.shell}`} data-participant-neon>
      <div className={styles.content}>
        <ParticipantCompactHeader
          roomCode={roomCode}
          displayName={participant.displayName}
          disambiguationIndex={participant.disambiguationIndex}
          connectionState={connectionState}
        />
        {contextState && <SessionContextStrip state={contextState} />}
        <NowSingingHero entry={singingEntry} />

        {isLoading ? (
          <div className={styles.loading} role="status">
            <Loader2 className={`${styles.spinner}`} size={25} aria-hidden="true" />
            <span>Carregando sua posição…</span>
          </div>
        ) : (
          <>
            <ParticipantQueueCard
              entry={participantEntry}
              displayPosition={participantPosition}
              isOffline={isOffline || isReconnecting}
            />
            <section aria-labelledby="upcoming-queue-title">
              <div className={styles.queueHeader}>
                <h2 id="upcoming-queue-title">Próximas na fila</h2>
                <span>{upcoming.length} {upcoming.length === 1 ? 'pessoa' : 'pessoas'}</span>
              </div>
              {isOffline && queue.length === 0 ? (
                <div className={styles.emptyQueue}>A fila está indisponível enquanto a conexão não for restabelecida.</div>
              ) : upcoming.length === 0 ? (
                <div className={styles.emptyQueue}>Não há outras músicas aguardando no momento.</div>
              ) : (
                <div className={styles.queue}>
                  {upcoming.map((entry) => (
                    <CompactQueueRow
                      key={entry.id}
                      entry={entry}
                      displayPosition={queue.findIndex((candidate) => candidate.id === entry.id) + 1}
                      isCurrentUser={entry.participantId === participant.id}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
      <RequestMusicSheet sessionId={sessionId} dockContext={dockContext} isOffline={isOffline || isReconnecting} />
    </main>
  );
}
