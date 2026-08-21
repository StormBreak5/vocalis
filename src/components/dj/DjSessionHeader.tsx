'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Copy, Ellipsis, ExternalLink, History, MicVocal, Radio, X } from 'lucide-react';
import { toast } from 'sonner';
import { CloseSessionButton } from '@/src/components/session/CloseSessionButton';
import { SessionStatusToggle } from '@/src/components/session/SessionStatusToggle';
import { useSessionLifecycleContext } from '@/src/components/session/SessionLifecycleProvider';
import styles from './dj-dashboard.module.css';
import foundation from '@/src/components/vocalis/vocalis-neon-foundation.module.css';

export type DjConnectionState = 'live' | 'offline' | 'reconnecting';

export function DjSessionStatus({ connectionState }: { connectionState: DjConnectionState }) {
  const { snapshot } = useSessionLifecycleContext();
  const sessionStatus = snapshot?.status ?? 'active';
  const connectionLabel = connectionState === 'live'
    ? 'Ao vivo'
    : connectionState === 'reconnecting' ? 'Reconectando' : 'Offline';
  const sessionLabel = sessionStatus === 'paused'
    ? 'Fila pausada'
    : sessionStatus === 'closed' ? 'Sala encerrada' : 'Sessão ativa';

  return (
    <div className={styles.statusGroup} aria-label="Estado da sessão">
      <span className={styles.sessionStatus} data-state={connectionState} role="status">
        {connectionState === 'live' ? <span className={styles.statusDot} aria-hidden="true" /> : <Radio size={14} aria-hidden="true" />}
        {connectionLabel}
      </span>
      <span className={styles.sessionStatus} data-state={sessionStatus}>
        <span className={styles.statusDot} aria-hidden="true" />
        {sessionLabel}
      </span>
    </div>
  );
}

function DisplayLink({ roomCode }: { roomCode: string }) {
  return (
    <Link
      className={styles.displayLink}
      href={`/sala/${encodeURIComponent(roomCode)}/display`}
      target="_blank"
      rel="noopener noreferrer"
    >
      <ExternalLink size={17} aria-hidden="true" />
      Abrir telão
    </Link>
  );
}

function HistoryLink() {
  return (
    <Link className={styles.displayLink} href="/historico">
      <History size={17} aria-hidden="true" />
      Ver histórico
    </Link>
  );
}

function SessionControls({
  disabled,
  roomCode,
  mobile = false,
}: {
  disabled: boolean;
  roomCode: string;
  mobile?: boolean;
}) {
  return (
    <>
      <DisplayLink roomCode={roomCode} />
      <HistoryLink />
      <SessionStatusToggle disabled={disabled} appearance="neon" />
      <CloseSessionButton
        disabled={disabled}
        appearance="neon"
        disabledMessage="Aguarde a reconexão para encerrar a sala."
        showDisabledMessage={mobile}
      />
    </>
  );
}

function MobileSessionControls({ disabled, roomCode }: { disabled: boolean; roomCode: string }) {
  const popupRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root modal>
      <Dialog.Trigger className={styles.secondaryTrigger} aria-label="Abrir controles da sessão">
        <Ellipsis size={21} aria-hidden="true" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.sheetBackdrop} />
        <Dialog.Popup
          ref={popupRef}
          className={`${foundation.theme} ${styles.sheet}`}
          initialFocus={() => popupRef.current?.querySelector<HTMLButtonElement>('[data-session-sheet-close]') ?? null}
        >
          <div className={styles.sheetHandle} aria-hidden="true" />
          <div className={styles.sheetHeading}>
            <div><Dialog.Title>Controles da sessão</Dialog.Title><Dialog.Description>Pause novos pedidos ou encerre a sala.</Dialog.Description></div>
            <Dialog.Close className={styles.sheetClose} data-session-sheet-close aria-label="Fechar controles da sessão"><X size={21} aria-hidden="true" /></Dialog.Close>
          </div>
          <div className={styles.sheetActions}>
            <DisplayLink roomCode={roomCode} />
            <HistoryLink />
            <SessionStatusToggle disabled={disabled} appearance="neon" />
            <div className={styles.destructiveGroup}>
              <CloseSessionButton
                disabled={disabled}
                appearance="neon"
                disabledMessage="Aguarde a reconexão para encerrar a sala."
              />
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function DjSessionHeader({
  roomCode,
  connectionState,
  controlsDisabled,
}: {
  roomCode: string;
  connectionState: DjConnectionState;
  controlsDisabled: boolean;
}) {
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      toast.success('Código copiado!');
    } catch {
      toast.error('Falha ao copiar o código.');
    }
  };

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <div className={styles.brand}>
          <span className={styles.brandMark}><MicVocal size={21} aria-hidden="true" /></span>
          <span className={styles.brandCopy}><span className={styles.brandName}>Vocalis</span><h1 className={styles.brandRole}>Painel do DJ</h1></span>
        </div>
        <div className={styles.room}>
          <span className={styles.roomLabel}>Sala</span>
          <span className={styles.roomCode}>{roomCode}</span>
          <button type="button" className={styles.iconButton} onClick={() => void copyCode()} aria-label="Copiar código da sala"><Copy size={18} aria-hidden="true" /></button>
        </div>
        <DjSessionStatus connectionState={connectionState} />
        <div className={styles.desktopControls}><SessionControls disabled={controlsDisabled} roomCode={roomCode} /></div>
        <div className={styles.mobileQuickToggle}><SessionStatusToggle disabled={controlsDisabled} appearance="neon" /></div>
        <div className={styles.mobileControls}><MobileSessionControls disabled={controlsDisabled} roomCode={roomCode} /></div>
      </div>
    </header>
  );
}
