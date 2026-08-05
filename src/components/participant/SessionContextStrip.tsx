import { CloudOff, PauseCircle, RefreshCw } from 'lucide-react';
import styles from './participant-neon.module.css';

export type SessionContextState = 'paused' | 'offline' | 'reconnecting';

const copy: Record<SessionContextState, string> = {
  paused: 'O DJ pausou novos pedidos. A fila atual continua visível.',
  offline: 'Sem conexão. A fila exibida pode estar desatualizada.',
  reconnecting: 'Reconectando. Aguarde a atualização da fila antes de agir.',
};

export function SessionContextStrip({ state }: { state: SessionContextState }) {
  const Icon = state === 'paused' ? PauseCircle : state === 'offline' ? CloudOff : RefreshCw;
  return (
    <div className={styles.strip} data-state={state} role="status" aria-live="polite">
      <Icon size={16} aria-hidden="true" />
      <span>{copy[state]}</span>
    </div>
  );
}
