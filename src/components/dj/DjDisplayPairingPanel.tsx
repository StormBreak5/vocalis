'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, MonitorPlay, X } from 'lucide-react';
import { toast } from 'sonner';
import { generateDisplayPairingCodeAction } from '@/src/application/display-pairing/generate-display-pairing-code.action';
import { revokeDisplayPairingAction } from '@/src/application/display-pairing/revoke-display-pairing.action';
import type { PairedDisplaySummary } from '@/src/domain/display-pairing.types';
import styles from './dj-dashboard.module.css';

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// pairedDisplays.id não tem nenhum rótulo humano — a RPC deliberadamente não
// devolve nada além de id/paired_at (FR-010: nenhum dado de participants
// vaza para o telão nem para esta lista). A posição no array, já ordenado
// por paired_at pelo hook, mais o horário, é o mínimo para o Host distinguir
// duas TVs numa mesma sessão sem nova coluna nem nova RPC — ver research.md.
function formatPairedTime(pairedAt: string): string {
  return new Date(pairedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cosmetic countdown only: recomputes from an already-fetched expiresAt on
  // a local timer. Not a data fetch, not polling the server.
  useEffect(() => {
    // remainingMs só é lido pela UI dentro de `{generatedCode && (...)}`
    // (abaixo), então não precisa ser resetado aqui — nenhum setState
    // síncrono no corpo do efeito, só a assinatura do timer em si.
    if (!generatedCode) return;
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

  // Sem estado otimista de propósito (plan.md): o próprio evento Realtime de
  // UPDATE em display_pairings (revoked_at preenchido) é o que remove o item
  // desta lista, via useDisplayPairings. A revogação em si não é instantânea
  // para a TV afetada — ver research.md — mas a lista do Host reflete o
  // commit assim que o evento chega, sem precisar de um segundo caminho de
  // atualização local que poderia divergir do estado real do banco.
  const handleRevoke = async (displayPairingId: string) => {
    if (revokingId) return;
    setRevokingId(displayPairingId);
    try {
      const result = await revokeDisplayPairingAction(displayPairingId);
      if (!result.ok) {
        toast.error('Erro ao revogar telão', { description: result.userMessage });
      }
    } catch {
      toast.error('Erro inesperado ao revogar telão.');
    } finally {
      setRevokingId(null);
    }
  };

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
          {pairedDisplays.map((display, index) => {
            const label = `Telão ${index + 1}`;
            const isRevoking = revokingId === display.id;
            return (
              <li key={display.id} className={styles.participantRow} data-online>
                <span className={styles.avatar} aria-hidden="true"><MonitorPlay size={16} /></span>
                <div>
                  <div className={styles.participantName}>{label}</div>
                  <div className={styles.participantMeta} data-presence="online">Pareado às {formatPairedTime(display.pairedAt)}</div>
                </div>
                <button
                  type="button"
                  className={styles.skipAction}
                  onClick={() => void handleRevoke(display.id)}
                  disabled={revokingId !== null}
                  aria-busy={isRevoking}
                  aria-label={`Revogar ${label}`}
                >
                  {isRevoking ? <Loader2 className={styles.spinner} size={17} aria-hidden="true" /> : <X size={17} aria-hidden="true" />}
                  <span>{isRevoking ? 'Revogando…' : 'Revogar'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
