'use client';

import { useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Loader2, X } from 'lucide-react';
import { useSessionLifecycleContext } from '@/src/components/session/SessionLifecycleProvider';
import { closeSessionAction } from '@/src/application/session/close-session.action';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';
import { useRouter } from 'next/navigation';

type CloseState = 'idle' | 'loading' | 'error' | 'uncertain';

export function CloseSessionButton() {
  const { sessionId } = useSessionLifecycleContext();
  const { isOnline } = useOnlineStatus();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [state, setState] = useState<CloseState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isLoading = state === 'loading';
  const isDisabled = !isOnline || isLoading;

  async function handleConfirm() {
    if (isLoading) return; // deduplicação
    setState('loading');
    setErrorMessage(null);
    try {
      const result = await closeSessionAction(sessionId);
      if (result.ok) {
        setOpen(false);
        setState('idle');
        router.refresh();
      } else if (result.code === 'RESPONSE_UNCERTAIN') {
        setState('uncertain');
        setErrorMessage('Não foi possível confirmar se a sala foi encerrada. Verifique sua conexão e tente novamente.');
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

  return (
    <div>
      {!isOnline && (
        <p
          className="text-xs text-amber-400 mb-2 text-center"
          aria-live="polite"
        >
          Conexão necessária para encerrar a sala.
        </p>
      )}

      <AlertDialog.Root open={open} onOpenChange={(v) => { if (!isLoading) setOpen(v); }}>
        <AlertDialog.Trigger asChild>
          <button
            type="button"
            disabled={isDisabled}
            aria-label="Encerrar sala"
            className={[
              'w-full min-h-[48px] px-6 py-3 rounded-lg font-semibold text-sm',
              'bg-red-700 hover:bg-red-600 active:bg-red-800',
              'text-white transition-colors duration-150',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2',
            ].join(' ')}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                Encerrando…
              </span>
            ) : (
              'Encerrar sala'
            )}
          </button>
        </AlertDialog.Trigger>

        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 animate-in fade-in-0" />
          <AlertDialog.Content
            role="alertdialog"
            className={[
              'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
              'w-[calc(100vw-2rem)] max-w-sm rounded-2xl p-6',
              'bg-zinc-900 border border-zinc-700 shadow-2xl',
              'focus:outline-none',
            ].join(' ')}
            onEscapeKeyDown={(e) => e.preventDefault()}
            deferPointerDownOutside={true}
          >
            <AlertDialog.Title className="text-lg font-bold text-white mb-2">
              Encerrar sala?
            </AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-zinc-400 mb-5">
              Esta ação é permanente. A sala será encerrada para todos os participantes e não poderá ser reaberta.
            </AlertDialog.Description>

            {(state === 'error' || state === 'uncertain') && errorMessage && (
              <div role="alert" className="mb-4 rounded-lg p-3 text-sm bg-red-900/50 border border-red-700 text-red-300">
                {errorMessage}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isLoading}
                aria-label="Confirmar encerramento"
                className={[
                  'w-full min-h-[48px] px-4 py-3 rounded-lg font-semibold text-sm',
                  'bg-red-700 hover:bg-red-600 active:bg-red-800 text-white',
                  'transition-colors duration-150',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2',
                ].join(' ')}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    Encerrando…
                  </span>
                ) : (
                  'Confirmar encerramento'
                )}
              </button>

              <button
                type="button"
                onClick={handleCancel}
                disabled={isLoading}
                aria-label="Cancelar"
                className={[
                  'w-full min-h-[48px] px-4 py-3 rounded-lg font-semibold text-sm',
                  'bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-900 text-zinc-200',
                  'transition-colors duration-150',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2',
                ].join(' ')}
              >
                Cancelar
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
