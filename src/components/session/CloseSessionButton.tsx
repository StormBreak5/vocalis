'use client';

import { useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Loader2 } from 'lucide-react';
import { useSessionLifecycleContext } from '@/src/components/session/SessionLifecycleProvider';
import { closeSessionAction } from '@/src/application/session/close-session.action';
import { getSessionStatus } from '@/src/application/session/get-session-status';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';
import { useRouter } from 'next/navigation';
import type { SessionStatusSnapshot } from '@/src/domain/session.types';
import foundation from '@/src/components/vocalis/vocalis-neon-foundation.module.css';

type CloseState = 'idle' | 'loading' | 'error' | 'uncertain';
type CloseAttempt =
  | { type: 'result'; result: Awaited<ReturnType<typeof closeSessionAction>> }
  | { type: 'timeout' };

const CLOSE_CONFIRMATION_TIMEOUT_MS = 8_000;

async function waitForCloseResult(sessionId: string): Promise<CloseAttempt> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<CloseAttempt>((resolve) => {
    timeoutId = setTimeout(
      () => resolve({ type: 'timeout' }),
      CLOSE_CONFIRMATION_TIMEOUT_MS,
    );
  });
  const action = closeSessionAction(sessionId).then(
    (result): CloseAttempt => ({ type: 'result', result }),
  );
  const outcome = await Promise.race([action, timeout]);
  if (timeoutId) clearTimeout(timeoutId);
  return outcome;
}

export function CloseSessionButton({
  disabled = false,
  appearance = 'default',
  disabledMessage,
  showDisabledMessage = true,
}: {
  disabled?: boolean;
  appearance?: 'default' | 'neon';
  disabledMessage?: string;
  showDisabledMessage?: boolean;
} = {}) {
  const { sessionId, snapshot, dispatch } = useSessionLifecycleContext();
  const { isOnline } = useOnlineStatus();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<CloseState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isLoading = state === 'loading';
  const isDisabled = disabled || !isOnline || isLoading;
  const connectionMessage = disabledMessage ?? 'Conexão necessária para encerrar a sala.';

  const applyClosedSnapshot = (closedSnapshot: SessionStatusSnapshot) => {
    dispatch({ type: 'SESSION_UPDATED', snapshot: closedSnapshot });
    setOpen(false);
    setState('idle');
    router.refresh();
  };

  async function handleConfirm() {
    if (isLoading) return;
    setState('loading');
    setErrorMessage(null);

    try {
      const outcome = await waitForCloseResult(sessionId);
      if (outcome.type === 'timeout') {
        dispatch({ type: 'reconnecting' });
        const recovered = await getSessionStatus(sessionId);
        if (
          recovered.ok
          && recovered.snapshot.status === 'closed'
          && recovered.snapshot.closedAt
        ) {
          applyClosedSnapshot(recovered.snapshot);
          return;
        }
        setState('uncertain');
        setErrorMessage(
          'Não foi possível confirmar se a sala foi encerrada. Verifique sua conexão e tente novamente.',
        );
        return;
      }

      const result = outcome.result;
      if (result.ok) {
        applyClosedSnapshot({
          id: result.result.sessionId,
          code: snapshot?.code ?? '',
          status: result.result.status,
          closedAt: result.result.closedAt,
        });
      } else if (result.code === 'RESPONSE_UNCERTAIN') {
        setState('uncertain');
        setErrorMessage(
          'Não foi possível confirmar se a sala foi encerrada. Verifique sua conexão e tente novamente.',
        );
      } else {
        setState('error');
        setErrorMessage(result.userMessage ?? 'Erro ao encerrar a sala. Tente novamente.');
      }
    } catch {
      setState('error');
      setErrorMessage('Erro inesperado ao encerrar a sala.');
    }
  }

  function handleCancel() {
    if (isLoading) return;
    setOpen(false);
    setState('idle');
    setErrorMessage(null);
  }

  const triggerClassName = appearance === 'neon'
    ? [
        'w-full min-h-[48px] px-5 py-3 rounded-[14px] border font-semibold text-sm',
        'border-[color-mix(in_oklch,var(--neon-red)_36%,transparent)]',
        'bg-[color-mix(in_oklch,var(--neon-red)_7%,transparent)] text-[var(--neon-red)]',
        'transition-[transform,opacity,background-color,border-color] duration-150',
        'hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed',
        'focus-visible:outline-none',
      ].join(' ')
    : [
        'w-full min-h-[48px] px-6 py-3 rounded-lg font-semibold text-sm',
        'bg-red-700 hover:bg-red-600 active:bg-red-800',
        'text-white transition-colors duration-150',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2',
      ].join(' ');

  return (
    <div>
      {showDisabledMessage && (disabled || !isOnline) && (
        <p
          className={appearance === 'neon'
            ? 'mb-2 text-center text-xs text-[var(--neon-amber)]'
            : 'text-xs text-amber-400 mb-2 text-center'}
          aria-live="polite"
        >
          {connectionMessage}
        </p>
      )}

      <AlertDialog.Root
        open={open}
        onOpenChange={(nextOpen) => {
          if (!isLoading) setOpen(nextOpen);
        }}
      >
        <AlertDialog.Trigger asChild>
          <button
            type="button"
            disabled={isDisabled}
            aria-label="Encerrar sala"
            className={triggerClassName}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                Encerrando…
              </span>
            ) : 'Encerrar sala'}
          </button>
        </AlertDialog.Trigger>

        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 animate-in fade-in-0" />
          <AlertDialog.Content
            role="alertdialog"
            className={[
              appearance === 'neon' ? foundation.theme : '',
              'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
              'w-[calc(100vw-2rem)] max-w-md rounded-3xl p-6',
              appearance === 'neon'
                ? 'bg-[var(--neon-surface-elevated)] border border-[color-mix(in_oklch,var(--neon-red)_27%,var(--neon-line))] text-[var(--neon-text)] shadow-2xl'
                : 'bg-zinc-900 border border-zinc-700 shadow-2xl',
              'focus:outline-none',
            ].join(' ')}
            onEscapeKeyDown={(event) => event.preventDefault()}
            deferPointerDownOutside
          >
            <AlertDialog.Title className={appearance === 'neon'
              ? 'mb-2 text-2xl font-bold text-[var(--neon-text)]'
              : 'text-lg font-bold text-white mb-2'}>
              Encerrar sala?
            </AlertDialog.Title>
            <AlertDialog.Description className={appearance === 'neon'
              ? 'mb-5 text-sm leading-relaxed text-[var(--neon-text-secondary)]'
              : 'text-sm text-zinc-400 mb-5'}>
              Esta ação é permanente. A sala será encerrada para todos os participantes e não poderá ser reaberta.
            </AlertDialog.Description>

            {(state === 'error' || state === 'uncertain') && errorMessage && (
              <div role="alert" className="mb-4 rounded-lg p-3 text-sm bg-red-900/50 border border-red-700 text-red-200">
                {errorMessage}
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 sm:grid sm:grid-cols-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isLoading}
                aria-label="Cancelar"
                className={[
                  'w-full min-h-[48px] px-4 py-3 rounded-[14px] font-semibold text-sm',
                  appearance === 'neon'
                    ? 'border border-[var(--neon-line)] bg-[var(--neon-surface-soft)] text-[var(--neon-text)] hover:brightness-110'
                    : 'bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-900 text-zinc-200',
                  'transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none',
                ].join(' ')}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={isLoading}
                aria-label="Confirmar encerramento"
                className="w-full min-h-[48px] px-4 py-3 rounded-[14px] font-semibold text-sm bg-red-700 hover:bg-red-600 active:bg-red-800 text-white transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    Encerrando…
                  </span>
                ) : 'Confirmar encerramento'}
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
