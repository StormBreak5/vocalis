'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/src/infrastructure/supabase/client';
import { listActiveQueueAction } from '@/src/application/queue/list-active-queue.action';
import { ActiveQueueEntry, QueueEntry } from '@/src/domain/queue.types';
import { toast } from 'sonner';
import { RealtimeChannel } from '@supabase/supabase-js';

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
    } catch (error) {
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
    let channel: RealtimeChannel;

    const setupRealtime = async () => {
      channel = supabase.channel(`queue:${sessionId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'queue',
            filter: `session_id=eq.${sessionId}`,
          },
          async (payload: { new: any; old: any; eventType: 'INSERT' | 'UPDATE' | 'DELETE' }) => {
            const newRecord = payload.new as QueueEntry;
            const oldRecord = payload.old as Partial<QueueEntry>;
            const eventType = payload.eventType;

            if (eventType === 'INSERT') {
              // Fetch the participant name, since it's not in the queue table directly
              const { data: pData } = await supabase
                .from('participants')
                .select('display_name')
                .eq('id', newRecord.participantId)
                .single();

              const participantName = pData?.display_name || 'Cantor';

              const entry: ActiveQueueEntry = {
                ...newRecord,
                status: newRecord.status as QueueEntry['status'],
                participantName,
              };

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
                setQueue((prev) => prev.map((item) => item.id === newRecord.id ? { ...item, ...newRecord } as ActiveQueueEntry : item));
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

    setupRealtime();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [sessionId, fetchInitialQueue]);

  return { queue, isLoading, isOffline, refresh: fetchInitialQueue };
}
