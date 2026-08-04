'use client';

import { useState } from 'react';
import { useSessionLifecycleContext } from './SessionLifecycleProvider';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useRouter } from 'next/navigation';
import { Loader2, LogOut } from 'lucide-react';
import { performRoomCleanup } from '@/src/hooks/session-room-cleanup';

export function SessionClosedDialog() {
  const { phase, sessionId } = useSessionLifecycleContext();
  const router = useRouter();
  const [isLeaving, setIsLeaving] = useState(false);

  const isClosed = phase === 'closed';

  const handleLeave = async () => {
    if (isLeaving) return;

    setIsLeaving(true);
    await performRoomCleanup(sessionId);
    router.replace('/');
  };

  return (
    <AlertDialog.Root open={isClosed}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
        <AlertDialog.Content
          onEscapeKeyDown={(event) => event.preventDefault()}
          className="fixed left-1/2 top-1/2 z-50 grid w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg sm:rounded-lg duration-200"
        >
          <div className="flex flex-col space-y-2 text-center sm:text-left">
            <AlertDialog.Title className="text-xl font-bold">
              Sala encerrada
            </AlertDialog.Title>
            <AlertDialog.Description className="text-muted-foreground mb-4">
              O DJ encerrou esta sessão de karaokê.
            </AlertDialog.Description>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-4">
            <button
              type="button"
              onClick={() => void handleLeave()}
              disabled={isLeaving}
              className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
            >
              {isLeaving ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
                  Saindo...
                </>
              ) : (
                <>
                  <LogOut className="mr-2 h-5 w-5" aria-hidden="true" />
                  Voltar para o início
                </>
              )}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}