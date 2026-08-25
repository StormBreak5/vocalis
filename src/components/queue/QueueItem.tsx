'use client';

import { ActiveQueueEntry, artistLabel, songTitleLabel } from '@/src/domain/queue.types';
import { Badge } from '@/src/components/ui/badge';
import { cn } from '@/src/lib/utils';
import { Music, User } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { useSessionLifecycleContext } from '@/src/components/session/SessionLifecycleProvider';
import { updateQueueStatusAction } from '@/src/application/queue/update-queue-status.action';
import { cancelQueueEntryAction } from '@/src/application/queue/cancel-queue-entry.action';
import { toast } from 'sonner';

interface QueueItemProps {
  entry: ActiveQueueEntry;
  isCurrentUser: boolean;
  onCancel?: (id: string) => void;
  isHost?: boolean;
}

export function QueueItem({ entry, isCurrentUser, onCancel, isHost = false }: QueueItemProps) {
  const isSinging = entry.status === 'singing';
  const isPreparing = entry.status === 'preparing';

  let writesAllowed = true;
  try {
    const lifecycle = useSessionLifecycleContext();
    writesAllowed = lifecycle.writesAllowed;
  } catch {}

  const handleStatusChange = async (newStatus: ActiveQueueEntry['status']) => {
    if (!writesAllowed) return;
    try {
      const result = await updateQueueStatusAction(entry.id, newStatus);
      if (!result.ok) {
        toast.error('Erro ao atualizar status', { description: result.userMessage });
      }
    } catch {
      toast.error('Erro inesperado', { description: 'Tente novamente.' });
    }
  };

  const handleCancel = async () => {
    if (!writesAllowed) return;
    try {
      const result = await cancelQueueEntryAction(entry.id);
      if (!result.ok) {
        toast.error('Erro ao cancelar', { description: result.userMessage });
      } else {
        toast.success('Música cancelada.');
        if (onCancel) onCancel(entry.id);
      }
    } catch {
      toast.error('Erro inesperado', { description: 'Tente novamente.' });
    }
  };

  return (
    <div 
      className={cn(
        "flex items-center justify-between p-4 rounded-xl border shadow-sm transition-all",
        isSinging ? "bg-primary/10 border-primary shadow-primary/20 scale-[1.02]" : "bg-card",
        isPreparing ? "bg-amber-500/10 border-amber-500/50" : ""
      )}
    >
      <div className="flex flex-col space-y-1">
        <div className="flex items-center space-x-2">
          <span className="font-bold text-lg">{songTitleLabel(entry)}</span>
          {isCurrentUser && (
            <Badge variant="default" className="bg-primary text-primary-foreground px-2 py-0.5 text-xs">
              Você
            </Badge>
          )}
          {isSinging && (
            <Badge variant="outline" className="text-primary border-primary animate-pulse">
              Cantando agora
            </Badge>
          )}
          {isPreparing && (
            <Badge variant="outline" className="text-amber-500 border-amber-500">
              Preparando...
            </Badge>
          )}
        </div>
        
        <div className="flex items-center text-muted-foreground text-sm space-x-4">
          <span className="flex items-center">
            <Music className="w-3 h-3 mr-1" />
            {artistLabel(entry)}
          </span>
          <span className="flex items-center">
            <User className="w-3 h-3 mr-1" />
            {entry.participantName}
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-2 mt-3 sm:mt-0">
        {isCurrentUser && entry.status === 'pending' && (
          <Button size="sm" variant="ghost" disabled={!writesAllowed} className="min-h-[48px] text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleCancel()}>
            Cancelar
          </Button>
        )}
        {isHost && writesAllowed && (
          <div className="flex flex-wrap items-center gap-2 mt-3 sm:mt-0">
            {entry.status === 'pending' && (
              <Button size="sm" variant="outline" className="min-h-[48px]" onClick={() => handleStatusChange('preparing')}>
                Chamar
              </Button>
            )}
            {entry.status === 'preparing' && (
              <Button size="sm" className="min-h-[48px]" onClick={() => handleStatusChange('singing')}>
                Play
              </Button>
            )}
            {entry.status === 'singing' && (
              <Button size="sm" variant="default" className="min-h-[48px]" onClick={() => handleStatusChange('completed')}>
                Finalizar
              </Button>
            )}
            <Button size="sm" variant="ghost" className="min-h-[48px] text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleStatusChange('cancelled')}>
              Pular
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
