'use client';

import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MicVocal } from 'lucide-react';
import { toast } from 'sonner';
import { redeemDisplayPairingCodeAction } from '@/src/application/display-pairing/redeem-display-pairing-code.action';
import { normalizeCode } from '@/src/domain/validators/session-code.validator';
import styles from './display.module.css';

// FR-015: código inexistente, expirado, já consumido e sala inexistente
// colapsam todos em PAIRING_CODE_INVALID no banco. A UI preserva essa
// indistinguibilidade — nunca mostra uma mensagem diferente por causa.
const GENERIC_PAIRING_ERROR = 'Código de pareamento inválido ou expirado.';

export function DisplayPairingScreen({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setCode(normalizeCode(event.target.value).slice(0, 6));
    setErrorMessage(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isPending || code.length !== 6) return;

    setIsPending(true);
    setErrorMessage(null);

    try {
      const result = await redeemDisplayPairingCodeAction(roomCode, code);
      if (result.ok) {
        router.refresh();
        return;
      }
      const message = result.code === 'PAIRING_CODE_INVALID' ? GENERIC_PAIRING_ERROR : result.userMessage;
      setErrorMessage(message);
      toast.error(message);
    } catch {
      setErrorMessage('Não foi possível parear. Tente novamente.');
      toast.error('Não foi possível parear. Tente novamente.');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className={styles.pairingState} data-display-pairing-screen>
      <div className={styles.pairingContent}>
        <div className={`${styles.brand} ${styles.pairingBrand}`}>
          <span className={styles.brandMark}><MicVocal aria-hidden="true" /></span>
          <span>Vocalis</span>
        </div>
        <h1>Parear este telão</h1>
        <p>Peça ao DJ o código de pareamento gerado no painel da sessão.</p>

        <form onSubmit={(event) => void handleSubmit(event)} className={styles.pairingForm}>
          <label htmlFor="pairing-code" className={styles.pairingLabel}>Código de pareamento</label>
          <input
            id="pairing-code"
            name="pairing-code"
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={6}
            value={code}
            onChange={handleChange}
            disabled={isPending}
            placeholder="AB23CD"
            className={styles.pairingInput}
            aria-invalid={Boolean(errorMessage)}
            aria-describedby={errorMessage ? 'pairing-code-error' : undefined}
          />
          {errorMessage && (
            <p id="pairing-code-error" role="alert" className={styles.pairingError}>{errorMessage}</p>
          )}
          <button
            type="submit"
            disabled={isPending || code.length !== 6}
            aria-busy={isPending}
            className={styles.pairingButton}
          >
            {isPending ? (
              <span className={styles.pairingButtonLoading}>
                <Loader2 className={styles.pairingSpinner} size={22} aria-hidden="true" />
                Pareando…
              </span>
            ) : 'Parear telão'}
          </button>
        </form>
      </div>
    </div>
  );
}
