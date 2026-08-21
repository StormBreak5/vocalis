'use client';

import Image from 'next/image';
import { Dialog } from '@base-ui/react/dialog';
import { QrCode, X } from 'lucide-react';
import type { RoomEntryQrResult } from '@/src/infrastructure/qr/room-entry-qr';
import styles from './participant-neon.module.css';
import foundation from '@/src/components/vocalis/vocalis-neon-foundation.module.css';

export function RoomQrDialog({
  roomCode,
  qr,
}: {
  roomCode: string;
  qr: Extract<RoomEntryQrResult, { status: 'ready' }>;
}) {
  return (
    <Dialog.Root modal>
      <Dialog.Trigger className={styles.roomLineTrigger} aria-label={`Mostrar QR Code da sala ${roomCode}`}>
        <span>Sala</span>
        <span className={styles.roomCode}>{roomCode}</span>
        <QrCode size={13} aria-hidden="true" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={`${foundation.theme} ${styles.sheet} ${styles.qrSheet}`}>
          <div className={styles.sheetHandle} aria-hidden="true" />
          <div className={styles.sheetHeader}>
            <div>
              <Dialog.Title>Convide para a sala</Dialog.Title>
              <Dialog.Description>Peça para seu amigo apontar a câmera.</Dialog.Description>
            </div>
            <Dialog.Close className={styles.closeButton} aria-label="Fechar QR Code">
              <X size={21} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className={styles.qrFrame}>
            <Image src={qr.svgDataUrl} alt="" aria-hidden="true" width={280} height={280} unoptimized />
          </div>
          <div className={styles.qrRoomCode}>{roomCode}</div>
          <p className={styles.qrUrl}>{qr.entryUrl}</p>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
