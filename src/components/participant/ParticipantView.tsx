'use client';

import { Participant } from '@/src/domain/participant.types';
import { Session } from '@/src/domain/session.types';
import { formatParticipantLabel } from '@/src/domain/participant.utils';
import { Badge } from '@/src/components/ui/badge';
import { Info } from 'lucide-react';

interface ParticipantViewData extends Participant {
  isCurrentUser: boolean;
}

interface ParticipantViewProps {
  participant: ParticipantViewData;
  session: {
    code: string;
    status: Session['status'];
  };
}

export function ParticipantView({ participant, session }: ParticipantViewProps) {
  const label = formatParticipantLabel(participant.displayName, participant.disambiguationIndex);

  return (
    <div className="w-full flex flex-col space-y-4">
      {session.status === 'paused' && (
        <div className="bg-blue-900/50 text-blue-200 p-4 rounded-xl flex items-center shadow-inner border border-blue-800">
          <Info className="w-5 h-5 mr-3 flex-shrink-0" />
          <p className="text-sm font-medium">A fila está pausada.</p>
        </div>
      )}
      
      <div className="bg-card text-card-foreground border border-border p-4 rounded-xl flex items-center justify-between shadow-sm">
        <span className="text-lg font-bold truncate pr-4">{label}</span>
        {participant.isCurrentUser && (
          <Badge 
            variant="default" 
            className="bg-primary/20 text-primary hover:bg-primary/30 border-none px-3 py-1 text-xs"
            aria-label="Este é você"
          >
            Você
          </Badge>
        )}
      </div>
    </div>
  );
}
