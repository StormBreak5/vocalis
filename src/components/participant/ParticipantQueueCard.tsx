'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cancelQueueEntryAction } from '@/src/application/queue/cancel-queue-entry.action';
import { useSessionLifecycleContext } from '@/src/components/session/SessionLifecycleProvider';
import type { ActiveQueueEntry } from '@/src/domain/queue.types';
import styles from './participant-neon.module.css';

function statusLabel(entry?: ActiveQueueEntry) {
  if (!entry) return 'Escolha sua próxima música';
  if (entry.status === 'singing') return 'Você está cantando';
  if (entry.status === 'preparing') return 'Você é o próximo';
  return 'Aguardando';
}

export function ParticipantQueueCard({
  entry,
  displayPosition,
  isOffline,
}: {
  entry?: ActiveQueueEntry;
  displayPosition?: number;
  isOffline: boolean;
}) {
  const { writesAllowed } = useSessionLifecycleContext();
  const [isCancelling, setIsCancelling] = useState(false);
  const canCancel = entry?.status === 'pending' && writesAllowed && !isOffline && !isCancelling;
  const label = statusLabel(entry);

  const handleCancel = async () => {
    if (!entry || !canCancel) return;
    setIsCancelling(true);
    try {
      const result = await cancelQueueEntryAction(entry.id);
      if (result.ok) {
        toast.success('Música cancelada.');
      } else {
        toast.error('Erro ao cancelar', { description: result.userMessage });
      }
    } catch {
      toast.error('Erro inesperado', { description: 'Tente novamente.' });
    } finally {
      setIsCancelling(false);
    }
  };

  const positionValue = entry?.status === 'singing'
    ? '♪'
    : entry?.status === 'preparing'
      ? '01'
      : displayPosition
        ? String(displayPosition).padStart(2, '0')
        : '—';

  return (
    <section className={styles.personalCard} aria-labelledby="participant-order-title">
      <div className={styles.position} aria-label={entry ? `Posição ${positionValue}` : 'Sem posição na fila'}>
        <div>
          <span className={styles.positionLabel}>posição</span>
          <strong className={styles.positionValue}>{positionValue}</strong>
        </div>
      </div>
      <div>
        <div className={styles.personalTitle}>
          <strong id="participant-order-title">{entry?.songTitle ?? 'Nenhum pedido ativo'}</strong>
          <span className={styles.youBadge}>VOCÊ</span>
        </div>
        <div className={styles.personalMeta}>
          {entry && <><span>{entry.artist}</span><span aria-hidden="true">•</span></>}
          <span className={entry?.status === 'preparing' ? styles.statusPreparing : styles.statusSuccess}>{label}</span>
        </div>
      </div>
      {entry?.status === 'pending' && (
        <button
          type="button"
          className={styles.cancelButton}
          onClick={handleCancel}
          disabled={!canCancel}
          aria-label="Cancelar seu pedido"
        >
          {isCancelling ? <Loader2 size={19} className={styles.spinner} aria-hidden="true" /> : <X size={20} aria-hidden="true" />}
        </button>
      )}
    </section>
  );
}
