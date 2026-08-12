import Image from 'next/image';
import type { RoomEntryQrResult } from '@/src/infrastructure/qr/room-entry-qr';
import styles from './display.module.css';

export function DisplayJoinPanel({
  code,
  qr,
}: {
  code: string;
  qr: RoomEntryQrResult;
}) {
  if (qr.status === 'origin-not-configured') {
    return (
      <aside className={`${styles.surface} ${styles.joinPanel}`} data-display-join-panel>
        <div className={styles.publicJoinTitle}>Entre no Vocalis</div>
        <div className={styles.publicJoinCopy}>Use o código abaixo na tela de entrada</div>
        <div className={styles.publicJoinDivider} aria-hidden="true" />
        <div className={styles.roomCodeLabel}>Código da sala</div>
        <div className={styles.roomCode}>{code}</div>
      </aside>
    );
  }

  return (
    <aside className={`${styles.surface} ${styles.joinPanel}`} data-display-join-panel>
      <div className={styles.joinKicker}>Entre na sala</div>
      <div className={styles.qrFrame}>
        <Image
          src={qr.svgDataUrl}
          alt=""
          aria-hidden="true"
          width={340}
          height={340}
          unoptimized
        />
      </div>
      <div className={styles.roomCodeLabel}>Código da sala</div>
      <div className={styles.roomCode}>{code}</div>
      <div className={styles.joinInstruction}>Aponte a câmera ou digite o código</div>
      <div className={styles.joinUrl}>{qr.entryUrl}</div>
    </aside>
  );
}
