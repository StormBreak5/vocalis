'use client';

import { Dialog } from '@base-ui/react/dialog';
import { Check, Mic2, PauseCircle, WifiOff } from 'lucide-react';
import styles from './participant-neon.module.css';

export type ParticipantDockContext = 'request' | 'queued' | 'paused' | 'offline' | 'reconnecting' | 'closed';

const content: Record<ParticipantDockContext, { label: string; note: string }> = {
  request: { label: 'Pedir música', note: 'Pedidos são adicionados ao final da fila.' },
  queued: { label: 'Você já está na fila', note: 'Seu próximo pedido será liberado após cantar.' },
  paused: { label: 'Pedidos pausados pelo DJ', note: 'Você poderá pedir assim que a fila for retomada.' },
  offline: { label: 'Reconecte para pedir música', note: 'Aguarde a conexão antes de fazer alterações.' },
  reconnecting: { label: 'Reconectando…', note: 'A fila será atualizada antes de liberar ações.' },
  closed: { label: 'Sala encerrada', note: 'Novos pedidos não estão disponíveis.' },
};

export function ParticipantActionDock({ context }: { context: ParticipantDockContext }) {
  const disabled = context !== 'request';
  const Icon = context === 'queued' ? Check : context === 'paused' ? PauseCircle : context === 'offline' || context === 'reconnecting' ? WifiOff : Mic2;
  return (
    <div className={styles.dock}>
      <Dialog.Trigger
        className={styles.dockButton}
        disabled={disabled}
        data-informative={disabled ? 'true' : undefined}
        data-context={context}
        aria-describedby="participant-action-note"
      >
        <Icon size={19} aria-hidden="true" />
        <span>{content[context].label}</span>
      </Dialog.Trigger>
      <div id="participant-action-note" className={styles.dockNote}>{content[context].note}</div>
    </div>
  );
}
