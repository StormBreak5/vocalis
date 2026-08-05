import styles from './participant-neon.module.css';

export type ConnectionVisualState = 'live' | 'paused' | 'reconnecting' | 'offline';

const labels: Record<ConnectionVisualState, string> = {
  live: 'Ao vivo',
  paused: 'Pausada',
  reconnecting: 'Reconectando',
  offline: 'Offline',
};

export function ConnectionStatusPill({ state }: { state: ConnectionVisualState }) {
  return (
    <span className={styles.connection} data-state={state} role="status" aria-live="polite">
      <span className={styles.dot} aria-hidden="true" />
      {labels[state]}
    </span>
  );
}
