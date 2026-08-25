'use client';

import { useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Pencil, X } from 'lucide-react';
import { RequestSongForm } from '@/src/components/queue/RequestSongForm';
import type { ActiveQueueEntry } from '@/src/domain/queue.types';
import styles from './participant-neon.module.css';
import formStyles from './participant-neon-form.module.css';
import foundation from '@/src/components/vocalis/vocalis-neon-foundation.module.css';

export function EditSongSheet({
  entry,
  disabled,
}: {
  entry: ActiveQueueEntry;
  disabled: boolean;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen} modal>
      <Dialog.Trigger
        className={styles.editButton}
        disabled={disabled}
        aria-label="Editar sua música"
      >
        <Pencil size={19} aria-hidden="true" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup
          ref={popupRef}
          className={`${foundation.theme} ${styles.sheet}`}
          initialFocus={() => popupRef.current?.querySelector<HTMLInputElement>('input') ?? null}
        >
          <div className={styles.sheetHandle} aria-hidden="true" />
          <div className={styles.sheetHeader}>
            <div>
              <Dialog.Title>Editar música</Dialog.Title>
              <Dialog.Description>Atualize título e artista antes de subir ao palco.</Dialog.Description>
            </div>
            <Dialog.Close className={styles.closeButton} aria-label="Fechar edição">
              <X size={21} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className={formStyles.form}>
            <RequestSongForm
              sessionId={entry.sessionId}
              mode="edit"
              queueId={entry.id}
              initialValues={{ songTitle: entry.songTitle ?? '', artist: entry.artist ?? '' }}
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
