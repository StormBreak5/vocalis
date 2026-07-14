export type SessionStatus = 'active' | 'paused' | 'closed';

export interface Session {
  id: string;
  code: string;
  status: SessionStatus;
  hostId: string;
  createdAt: string;
  closedAt: string | null;
  maxParticipants: number;
  maxQueueEntries: number;
}
