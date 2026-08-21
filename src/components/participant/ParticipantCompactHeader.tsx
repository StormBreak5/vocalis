import { MicVocal } from 'lucide-react';
import { formatParticipantLabel } from '@/src/domain/participant.utils';
import type { RoomEntryQrResult } from '@/src/infrastructure/qr/room-entry-qr';
import { ConnectionStatusPill, type ConnectionVisualState } from './ConnectionStatusPill';
import { RoomQrDialog } from './RoomQrDialog';
import styles from './participant-neon.module.css';

export function ParticipantCompactHeader({
  roomCode,
  displayName,
  disambiguationIndex,
  connectionState,
  qr,
}: {
  roomCode: string;
  displayName: string;
  disambiguationIndex: number;
  connectionState: ConnectionVisualState;
  qr: RoomEntryQrResult;
}) {
  const participantLabel = formatParticipantLabel(displayName, disambiguationIndex);

  return (
    <header className={styles.header}>
      <div>
        <div className={styles.brandLine}>
          <span className={styles.brandMark} aria-hidden="true"><MicVocal size={18} /></span>
          <span className={styles.brand}>Vocalis</span>
        </div>
        {qr.status === 'ready' ? (
          <RoomQrDialog roomCode={roomCode} qr={qr} />
        ) : (
          <div className={styles.roomLine}>
            <span>Sala</span>
            <span className={styles.roomCode}>{roomCode}</span>
          </div>
        )}
      </div>
      <div className={styles.identity}>
        <ConnectionStatusPill state={connectionState} />
        <span className={styles.person} title={participantLabel}>{participantLabel}</span>
      </div>
    </header>
  );
}
