'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RequestSongInput, requestSongSchema } from '@/src/domain/queue.types';
import { createQueueEntryAction } from '@/src/application/queue/create-queue-entry.action';
import { toast } from 'sonner';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Loader2 } from 'lucide-react';
import { useSessionLifecycleContext } from '@/src/components/session/SessionLifecycleProvider';

interface RequestSongFormProps {
  sessionId: string;
  hasActiveSong?: boolean;
  isOffline?: boolean;
}

export function RequestSongForm({ sessionId, hasActiveSong = false, isOffline = false }: RequestSongFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { snapshot, newQueueEntriesAllowed } = useSessionLifecycleContext();
  const isPaused = snapshot?.status === 'paused';
  const isClosed = snapshot?.status === 'closed';

  const form = useForm<RequestSongInput>({
    resolver: zodResolver(requestSongSchema),
    defaultValues: {
      songTitle: '',
      artist: '',
    },
  });

  const onSubmit = async (data: RequestSongInput) => {
    if (hasActiveSong || isOffline || !newQueueEntriesAllowed) return;

    setIsSubmitting(true);

    try {
      const response = await createQueueEntryAction(sessionId, data);

      if (response.ok) {
        toast.success('Música adicionada!', {
          description: 'Seu pedido foi colocado na fila.',
        });
        form.reset();
      } else {
        toast.error('Não foi possível adicionar', {
          description: response.userMessage,
        });
      }
    } catch {
      toast.error('Erro inesperado', {
        description: 'Tente novamente mais tarde.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDisabled = hasActiveSong || isOffline || isSubmitting || !newQueueEntriesAllowed;

  return (
    <div className="bg-card p-6 rounded-xl border shadow-sm">
      <h2 className="text-xl font-bold mb-4">Pedir Música</h2>

      {hasActiveSong && (
        <div className="mb-4 p-3 bg-primary/10 text-primary rounded-md text-sm border border-primary/20">
          🎤 Você já tem uma música na fila! Aguarde sua vez.
        </div>
      )}

      {isOffline && (
        <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-md text-sm border border-destructive/20">
          📶 Sem conexão. Reconecte para pedir música.
        </div>
      )}

      {isPaused && (
        <div className="mb-4 p-3 bg-blue-900/50 text-blue-200 rounded-md text-sm border border-blue-800" role="status">
          A fila está pausada. Aguarde o DJ retomar para pedir uma música.
        </div>
      )}

      {isClosed && (
        <div className="mb-4 p-3 bg-muted text-muted-foreground rounded-md text-sm border" role="status">
          Esta sala foi encerrada. Não é possível fazer novos pedidos.
        </div>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Nome da Música</label>
          <Input
            placeholder="Ex: Evidências"
            className="min-h-[48px] mt-2"
            disabled={isDisabled}
            {...form.register('songTitle')}
          />
          {form.formState.errors.songTitle && (
            <p className="text-sm font-medium text-destructive mt-1">{form.formState.errors.songTitle.message}</p>
          )}
        </div>

        <div>
          <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Artista / Banda</label>
          <Input
            placeholder="Ex: Chitãozinho & Xororó"
            className="min-h-[48px] mt-2"
            disabled={isDisabled}
            {...form.register('artist')}
          />
          {form.formState.errors.artist && (
            <p className="text-sm font-medium text-destructive mt-1">{form.formState.errors.artist.message}</p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full min-h-[48px] text-lg mt-2"
          disabled={isDisabled}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Enviando...
            </>
          ) : (
            'Colocar na Fila'
          )}
        </Button>
      </form>
    </div>
  );
}
