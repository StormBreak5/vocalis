'use client';

import { useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { RequestSongForm } from '@/src/components/queue/RequestSongForm';
import { ParticipantActionDock, type ParticipantDockContext } from './ParticipantActionDock';
import styles from './participant-neon.module.css';
import formStyles from './participant-neon-form.module.css';

export function RequestMusicSheet({
  sessionId,
  dockContext,
  isOffline,
}: {
  sessionId: string;
  dockContext: ParticipantDockContext;
  isOffline: boolean;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen} modal>
      <ParticipantActionDock context={dockContext} />
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup
          ref={popupRef}
          className={styles.sheet}
          initialFocus={() => popupRef.current?.querySelector<HTMLInputElement>('input') ?? null}
        >
          <div className={styles.sheetHandle} aria-hidden="true" />
          <div className={styles.sheetHeader}>
            <div>
              <Dialog.Title>Pedir música</Dialog.Title>
              <Dialog.Description>Adicione título e artista para entrar na fila.</Dialog.Description>
            </div>
            <Dialog.Close className={styles.closeButton} aria-label="Fechar painel de pedido">
              <X size={21} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className={formStyles.form}>
            <RequestSongForm
              sessionId={sessionId}
              isOffline={isOffline}
              showHeading={false}
              showContextMessages={false}
              onSuccess={() => setOpen(false)}
            />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
