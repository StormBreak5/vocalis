'use client';

import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from '@/src/infrastructure/supabase/client';
import { Database } from '@/src/infrastructure/supabase/database.types';
import { Participant } from '@/src/domain/participant.types';
import { formatParticipantLabel } from '@/src/domain/participant.utils';

type ParticipantRow = Database['public']['Tables']['participants']['Row'];

interface ParticipantsListProps {
  sessionId: string;
  initialParticipants: Participant[];
}

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

export function ParticipantsList({ sessionId, initialParticipants }: ParticipantsListProps) {
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

  return (
    <section className="mt-12 pt-8 border-t">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          Participantes
        </h2>
        <span className="text-sm text-muted-foreground font-medium bg-muted px-2.5 py-1 rounded-full">
          {participants.length}
        </span>
      </div>

      {participants.length === 0 ? (
        <div className="text-center p-8 border rounded-xl bg-card/50 text-muted-foreground">
          Ninguém entrou na sala ainda.
        </div>
      ) : (
        <ul className="space-y-3">
          {participants.map((participant) => (
            <li key={participant.id} className="p-4 border rounded-xl bg-card flex items-center justify-between">
              <span className="font-medium text-lg">
                {formatParticipantLabel(participant.displayName, participant.disambiguationIndex)}
              </span>
              <span className="text-xs text-muted-foreground">
                Entrou {new Date(participant.joinedAt).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
