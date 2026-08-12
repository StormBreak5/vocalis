import { MicVocal } from 'lucide-react';
import type { SessionStatus } from '@/src/domain/session.types';
import { DisplayFullscreenButton } from './DisplayFullscreenButton';
import styles from './display.module.css';

export type DisplayConnectionState = 'live' | 'offline' | 'reconnecting';

export function DisplayHeader({
  connectionState,
  sessionStatus,
}: {
  connectionState: DisplayConnectionState;
  sessionStatus: Exclude<SessionStatus, 'closed'>;
}) {
  const connectionLabel = connectionState === 'live'
    ? 'Ao vivo'
    : connectionState === 'offline' ? 'Offline · último estado' : 'Reconectando…';
  const sessionLabel = sessionStatus === 'paused' ? 'Sessão pausada' : 'Sessão ativa';

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.brandMark}>
          <MicVocal aria-hidden="true" />
        </span>
        <span>Vocalis</span>
      </div>
      <div className={styles.headerContext} aria-label="Estado do telão">
        <span className={styles.connectionStatus} data-state={connectionState} role="status">
          <span className={styles.statusDot} aria-hidden="true" />
          {connectionLabel}
        </span>
        <span className={styles.contextDivider} aria-hidden="true" />
        <span className={styles.sessionStatus}>{sessionLabel}</span>
        <DisplayFullscreenButton />
      </div>
    </header>
  );
}
