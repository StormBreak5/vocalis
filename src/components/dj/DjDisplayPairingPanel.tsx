'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, MonitorPlay } from 'lucide-react';
import { toast } from 'sonner';
import { generateDisplayPairingCodeAction } from '@/src/application/display-pairing/generate-display-pairing-code.action';
import type { PairedDisplaySummary } from '@/src/domain/display-pairing.types';
import styles from './dj-dashboard.module.css';

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function DjDisplayPairingPanel({
  sessionId,
  pairedDisplays,
}: {
  sessionId: string;
  pairedDisplays: PairedDisplaySummary[];
}) {
  const [isPending, setIsPending] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cosmetic countdown only: recomputes from an already-fetched expiresAt on
  // a local timer. Not a data fetch, not polling the server.
  useEffect(() => {
    if (!generatedCode) {
      setRemainingMs(null);
      return;
    }
    const expiresAtMs = new Date(generatedCode.expiresAt).getTime();
    const tick = () => {
      const remaining = expiresAtMs - Date.now();
      setRemainingMs(remaining);
      if (remaining <= 0 && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [generatedCode]);

  const handleGenerate = async () => {
    if (isPending) return;
    setIsPending(true);
    try {
      const result = await generateDisplayPairingCodeAction(sessionId);
      if (!result.ok) {
        toast.error('Erro ao gerar código', { description: result.userMessage });
        return;
      }
      setGeneratedCode({ code: result.pairing.code, expiresAt: result.pairing.expiresAt });
    } catch {
      toast.error('Erro inesperado ao gerar código.');
    } finally {
      setIsPending(false);
    }
  };

  const isExpired = remainingMs !== null && remainingMs <= 0;

  return (
    <section className={styles.card} aria-labelledby="dj-display-pairing-title" data-testid="dj-display-pairing-panel">
      <div className={styles.participantHeading}>
        <div>
          <h2 id="dj-display-pairing-title">Telões pareados</h2>
          <p>{pairedDisplays.length} pareado{pairedDisplays.length === 1 ? '' : 's'}</p>
        </div>
        <span className={styles.count} aria-label={`${pairedDisplays.length} telões pareados`}>{pairedDisplays.length}</span>
      </div>

      <button
        type="button"
        onClick={() => void handleGenerate()}
        disabled={isPending}
        aria-busy={isPending}
        className={styles.pairingGenerateButton}
      >
        {isPending ? (
          <span className={styles.pairingGenerateButtonLoading}>
            <Loader2 className={styles.spinner} size={18} aria-hidden="true" />
            Gerando…
          </span>
        ) : 'Parear telão'}
      </button>

      {generatedCode && (
        <div className={styles.pairingCodeCard} data-testid="dj-pairing-generated-code">
          <span className={styles.pairingCodeLabel}>Código de pareamento</span>
          <span className={styles.pairingCodeValue}>{generatedCode.code}</span>
          <span className={styles.pairingCodeExpiry} aria-live="polite">
            {isExpired
              ? 'Expirado — gere um novo código.'
              : `Expira em ${remainingMs !== null ? formatRemaining(remainingMs) : '5:00'}`}
          </span>
        </div>
      )}

      {pairedDisplays.length === 0 ? (
        <div className={styles.participantEmpty}>Nenhum telão pareado ainda.</div>
      ) : (
        <ul className={styles.participantList} aria-label="Telões pareados">
          {pairedDisplays.map((display) => (
            <li key={display.id} className={styles.participantRow} data-online>
              <span className={styles.avatar} aria-hidden="true"><MonitorPlay size={16} /></span>
              <div>
                <div className={styles.participantName}>Telão</div>
                <div className={styles.participantMeta} data-presence="online">Pareado</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
