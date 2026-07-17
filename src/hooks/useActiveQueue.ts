'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/src/infrastructure/supabase/client';
import { listActiveQueueAction } from '@/src/application/queue/list-active-queue.action';
import { ActiveQueueEntry, QueueEntry } from '@/src/domain/queue.types';
import { toast } from 'sonner';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Database } from '@/src/infrastructure/supabase/database.types';

type QueueRow = Database['public']['Tables']['queue']['Row'];

function mapQueueRow(row: QueueRow, participantName: string): ActiveQueueEntry {
  return {
    id: row.id,
    sessionId: row.session_id,
    participantId: row.participant_id,
    songTitle: row.song_title,
    artist: row.artist,
    status: row.status as QueueEntry['status'],
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    participantName,
  };
}

export function useActiveQueue(sessionId: string) {
  const [queue, setQueue] = useState<ActiveQueueEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  const fetchInitialQueue = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await listActiveQueueAction(sessionId);
      if (response.ok) {
        setQueue(response.queue);
        setIsOffline(false);
      } else {
        toast.error('Erro ao carregar fila', { description: response.userMessage });
        setIsOffline(true);
      }
    } catch {
      setIsOffline(true);
      toast.error('Erro de conexão', { description: 'Você parece estar offline.' });
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchInitialQueue();

    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let isCancelled = false;

    const setupRealtime = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (isCancelled) return;

      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      } else {
        await supabase.realtime.setAuth();
      }

      if (isCancelled) return;

      // Realtime reuses channels with the same topic. A unique topic prevents a
      // remount from receiving a channel that is still being removed asynchronously.
      const subscriptionId = crypto.randomUUID();

      channel = supabase.channel(`queue:${sessionId}:${subscriptionId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'queue',
            filter: `session_id=eq.${sessionId}`,
          },
          async (payload) => {
            const newRecord = payload.new as QueueRow;
            const oldRecord = payload.old as Partial<QueueRow>;
            const eventType = payload.eventType;

            if (eventType === 'INSERT') {
              // Fetch the participant name, since it's not in the queue table directly
              const { data: pData } = await supabase
                .from('participants')
                .select('display_name')
                .eq('id', newRecord.participant_id)
                .single();

              const participantName = pData?.display_name || 'Cantor';

              const entry = mapQueueRow(newRecord, participantName);

              setQueue((prev) => {
                const exists = prev.find((item) => item.id === entry.id);
                if (exists) return prev;
                return [...prev, entry].sort((a, b) => a.position - b.position);
              });
            } else if (eventType === 'UPDATE') {
              // If status is no longer active, remove it
              if (['completed', 'cancelled'].includes(newRecord.status)) {
                setQueue((prev) => prev.filter((item) => item.id !== newRecord.id));
              } else {
                setQueue((prev) => prev
                  .map((item) => item.id === newRecord.id
                    ? mapQueueRow(newRecord, item.participantName)
                    : item)
                  .sort((a, b) => a.position - b.position));
              }
            } else if (eventType === 'DELETE') {
              setQueue((prev) => prev.filter((item) => item.id !== oldRecord.id));
            }
          }
        )
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            setIsOffline(false);
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            setIsOffline(true);
          }
        });
    };

    void setupRealtime().catch(() => {
      if (isCancelled) return;
      setIsOffline(true);
      toast.error('Erro de conexão', {
        description: 'Não foi possível acompanhar as atualizações da fila.',
      });
    });

    return () => {
      isCancelled = true;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [sessionId, fetchInitialQueue]);

  return { queue, isLoading, isOffline, refresh: fetchInitialQueue };
}
