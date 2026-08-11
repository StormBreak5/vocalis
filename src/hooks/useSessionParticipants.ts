'use client';

import { useEffect, useState } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Participant } from '@/src/domain/participant.types';
import type { Database } from '@/src/infrastructure/supabase/database.types';
import { createClient } from '@/src/infrastructure/supabase/client';

type ParticipantRow = Database['public']['Tables']['participants']['Row'];

function mapParticipantRow(row: ParticipantRow): Participant {
  return {
    id: row.id,
    sessionId: row.session_id,
    displayName: row.display_name,
    disambiguationIndex: row.disambiguation_index,
    joinedAt: row.joined_at,
    lastSeen: row.last_seen,
    createdAt: row.created_at,
  };
}

export function useSessionParticipants(
  sessionId: string,
  initialParticipants: Participant[],
) {
  const [participants, setParticipants] = useState(initialParticipants);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`participants:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'participants',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload: RealtimePostgresChangesPayload<ParticipantRow>) => {
          if (payload.eventType === 'INSERT') {
            const participant = mapParticipantRow(payload.new);
            setParticipants((current) => current.some(({ id }) => id === participant.id)
              ? current
              : [...current, participant].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt)));
          } else if (payload.eventType === 'UPDATE') {
            const participant = mapParticipantRow(payload.new);
            setParticipants((current) => current.map((item) =>
              item.id === participant.id ? participant : item));
          } else if (payload.eventType === 'DELETE') {
            setParticipants((current) => current.filter(({ id }) => id !== payload.old.id));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return participants;
}
