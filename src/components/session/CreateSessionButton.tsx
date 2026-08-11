'use client';

import { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { createSessionAction } from '@/src/application/session/create-session.action';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';
import styles from './create-session-button.module.css';
import { cn } from '@/src/lib/utils';
import { replaceDocument } from '@/src/lib/browser-navigation';

export function CreateSessionButton({ variant = 'default' }: { variant?: 'default' | 'neon' }) {
  const [isPending, setIsPending] = useState(false);
  const { isOnline } = useOnlineStatus();

  const handleCreateSession = () => {
    if (!isOnline) {
      toast.error('Você está offline. Verifique sua conexão.');
      return;
    }

    setIsPending(true);

    let timeoutId: number | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error('CREATE_SESSION_TIMEOUT')), 20_000);
    });

    void Promise.race([createSessionAction(), timeout]).then((result) => {
      if (result.ok) {
        replaceDocument(`/sala/${result.session.code}/dj`);
      } else {
        toast.error(result.userMessage);
      }
    }).catch(() => {
      toast.error('A cria\u00e7\u00e3o da sala demorou demais. Atualize a p\u00e1gina para confirmar antes de tentar novamente.');
    }).finally(() => {
      window.clearTimeout(timeoutId);
      setIsPending(false);
    });
  };

  return (
    <Button
      onClick={handleCreateSession}
      disabled={isPending || !isOnline}
      className={cn("w-full min-h-[48px] text-lg font-semibold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg transition-transform active:scale-[0.98]", variant === 'neon' && styles.neon)}
      aria-label={!isOnline ? 'Ação indisponível offline' : isPending ? 'Criando sala...' : 'Criar nova sala de karaokê'}
      aria-busy={isPending}
      size="lg"
    >
      {isPending ? (
        <>
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          Criando sala...
        </>
      ) : (
        <>
          <Plus className="mr-2 h-6 w-6" />
          {variant === 'neon' ? 'Criar sala' : 'Criar Nova Sala'}
        </>
      )}
    </Button>
  );
}
