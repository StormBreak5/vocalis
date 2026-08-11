'use client';

import { Users } from 'lucide-react';
import type { Participant } from '@/src/domain/participant.types';
import { formatParticipantLabel } from '@/src/domain/participant.utils';
import { useSessionParticipants } from '@/src/hooks/useSessionParticipants';

interface ParticipantsListProps {
  sessionId: string;
  initialParticipants: Participant[];
}

export function ParticipantsList({ sessionId, initialParticipants }: ParticipantsListProps) {
  const participants = useSessionParticipants(sessionId, initialParticipants);

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
