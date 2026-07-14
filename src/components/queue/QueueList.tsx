'use client';

import { ActiveQueueEntry } from '@/src/domain/queue.types';
import { useActiveQueue } from '@/src/hooks/useActiveQueue';
import { QueueItem } from './QueueItem';
import { Loader2, WifiOff, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/src/components/ui/alert';
import { Button } from '@/src/components/ui/button';

interface QueueListProps {
  sessionId: string;
  currentParticipantId?: string;
  isHost?: boolean;
}

export function QueueList({ sessionId, currentParticipantId, isHost = false }: QueueListProps) {
  const { queue, isLoading, isOffline, refresh } = useActiveQueue(sessionId);

  return (
    <div className="w-full flex flex-col space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold">Fila Atual</h2>
        {isOffline && (
          <div className="flex items-center text-destructive text-sm font-medium">
            <WifiOff className="w-4 h-4 mr-2" />
            Offline
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin mb-4" />
          <p>Carregando a fila...</p>
        </div>
      ) : queue.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center bg-card border rounded-xl shadow-sm">
          <p className="text-muted-foreground mb-4">A fila está vazia no momento.</p>
          {isOffline && (
            <Button variant="outline" onClick={refresh}>
              Tentar reconectar
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {queue.map((entry: ActiveQueueEntry) => (
            <QueueItem 
              key={entry.id} 
              entry={entry} 
              isCurrentUser={entry.participantId === currentParticipantId}
              isHost={isHost}
            />
          ))}
        </div>
      )}
    </div>
  );
}
