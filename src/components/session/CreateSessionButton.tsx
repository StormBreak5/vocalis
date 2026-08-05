'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { createSessionAction } from '@/src/application/session/create-session.action';
import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';
import styles from './create-session-button.module.css';
import { cn } from '@/src/lib/utils';

export function CreateSessionButton({ variant = 'default' }: { variant?: 'default' | 'neon' }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { isOnline } = useOnlineStatus();

  const handleCreateSession = () => {
    if (!isOnline) {
      toast.error('Você está offline. Verifique sua conexão.');
      return;
    }

    startTransition(async () => {
      const result = await createSessionAction();
      if (result.ok) {
        router.push(`/sala/${result.session.code}/dj`);
      } else {
        toast.error(result.userMessage);
      }
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
