import { Pause, RefreshCw, WifiOff } from 'lucide-react';
import styles from './display.module.css';

export type DisplayBannerState = 'paused' | 'offline' | 'reconnecting';

export function DisplayConnectionBanner({ state }: { state: DisplayBannerState }) {
  const content = state === 'paused'
    ? {
      Icon: Pause,
      title: 'Novas entradas e pedidos estão pausados.',
      detail: 'A ordem atual continua visível.',
    }
    : state === 'offline'
      ? {
        Icon: WifiOff,
        title: 'Sem conexão.',
        detail: 'Exibindo o último estado conhecido; ele pode estar desatualizado.',
      }
      : {
        Icon: RefreshCw,
        title: 'Reconectando.',
        detail: 'Conferindo as atualizações da fila…',
      };

  return (
    <div className={styles.banner} data-state={state} role="status">
      <content.Icon size={22} aria-hidden="true" />
      <strong>{content.title}</strong>
      <span>{content.detail}</span>
    </div>
  );
}
