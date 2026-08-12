'use client';

import { Maximize, Minimize } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './display.module.css';

const INACTIVITY_DELAY_MS = 2_600;

export function DisplayFullscreenButton() {
  const [isSupported, setIsSupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearInactivityTimer = useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const revealTemporarily = useCallback(() => {
    if (!document.fullscreenElement) return;
    setIsVisible(true);
    clearInactivityTimer();
    timerRef.current = setTimeout(() => setIsVisible(false), INACTIVITY_DELAY_MS);
  }, [clearInactivityTimer]);

  useEffect(() => {
    // A disponibilidade só pode ser confirmada no navegador após a hidratação.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsSupported(
      typeof document.documentElement.requestFullscreen === 'function'
      && typeof document.exitFullscreen === 'function',
    );

    const handleFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      setIsVisible(true);
      clearInactivityTimer();
      if (active) {
        timerRef.current = setTimeout(() => setIsVisible(false), INACTIVITY_DELAY_MS);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('pointermove', revealTemporarily);
    document.addEventListener('focusin', revealTemporarily);
    document.addEventListener('keydown', revealTemporarily);

    return () => {
      clearInactivityTimer();
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('pointermove', revealTemporarily);
      document.removeEventListener('focusin', revealTemporarily);
      document.removeEventListener('keydown', revealTemporarily);
    };
  }, [clearInactivityTimer, revealTemporarily]);

  if (!isSupported) return null;

  const handleClick = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      setIsVisible(true);
    }
  };

  const label = isFullscreen ? 'Sair da tela cheia' : 'Entrar em tela cheia';
  const Icon = isFullscreen ? Minimize : Maximize;

  return (
    <button
      type="button"
      className={styles.fullscreenButton}
      data-visible={!isFullscreen || isVisible || undefined}
      onClick={() => void handleClick()}
      aria-label={label}
    >
      <Icon size={20} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
