export interface Participant {
  id: string;
  sessionId: string;
  displayName: string;
  disambiguationIndex: number;
  joinedAt: string;
  lastSeen: string;
  createdAt: string;
}

export interface ParticipantView extends Participant {
  displayLabel: string;
  isCurrentUser: boolean;
}
