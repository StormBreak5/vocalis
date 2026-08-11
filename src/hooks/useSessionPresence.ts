'use client';

import { useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/src/infrastructure/supabase/client';

type PresencePayload = {
  participantId: string;
  onlineAt: string;
};

const presenceTopic = (sessionId: string) => `presence:session:${sessionId}`;

export function useTrackParticipantPresence(sessionId: string, participantId: string) {
  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    const connect = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      } else {
        await supabase.realtime.setAuth();
      }
      if (cancelled) return;

      channel = supabase.channel(presenceTopic(sessionId), {
        config: { presence: { key: participantId } },
      });
      channel.subscribe((status) => {
        if (status !== 'SUBSCRIBED' || cancelled || !channel) return;
        void channel.track({
          participantId,
          onlineAt: new Date().toISOString(),
        } satisfies PresencePayload);
      });
    };

    void connect();

    return () => {
      cancelled = true;
      if (channel) {
        void channel.untrack().finally(() => {
          if (channel) void supabase.removeChannel(channel);
        });
      }
    };
  }, [participantId, sessionId]);
}

export function useSessionPresence(sessionId: string) {
  const [onlineParticipantIds, setOnlineParticipantIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(presenceTopic(sessionId));

    const syncPresence = () => {
      const state = channel.presenceState<PresencePayload>();
      setOnlineParticipantIds(new Set(
        Object.entries(state)
          .filter(([, presences]) => presences.length > 0)
          .map(([participantId]) => participantId),
      ));
    };

    channel
      .on('presence', { event: 'sync' }, syncPresence)
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return onlineParticipantIds;
}
