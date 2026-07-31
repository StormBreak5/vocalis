'use client';

import { useSessionLifecycleContext } from './SessionLifecycleProvider';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { performRoomCleanup } from '@/src/hooks/session-room-cleanup';

export function SessionClosedDialog() {
  const { phase, sessionId } = useSessionLifecycleContext();
  const router = useRouter();
  
  const isClosed = phase === 'closed';

  const handleLeave = () => {
    if (sessionId) performRoomCleanup(sessionId);
    router.replace('/');
  };

  return (
    <AlertDialog.Root open={isClosed}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
        <AlertDialog.Content 
          onEscapeKeyDown={(e: KeyboardEvent) => e.preventDefault()}
          className="fixed left-1/2 top-1/2 z-50 grid w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg sm:rounded-lg duration-200"
        >
          <div className="flex flex-col space-y-2 text-center sm:text-left">
            <AlertDialog.Title className="text-xl font-bold">Esta sessão foi encerrada.</AlertDialog.Title>
            <AlertDialog.Description className="text-muted-foreground mb-4">
              A sala foi fechada pelo DJ.
            </AlertDialog.Description>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-4">
            <button
              onClick={handleLeave}
              className="inline-flex items-center justify-center rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-primary text-primary-foreground hover:bg-primary/90 h-10 py-2 px-4 min-h-[48px] w-full sm:w-auto"
            >
              <LogOut className="w-5 h-5 mr-2" />
              Voltar ao início
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
