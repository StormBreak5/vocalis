import { z } from 'zod';

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

export const joinSessionPayloadSchema = z.strictObject({
  participant:z.strictObject({
    id:z.string().uuid(), session_id:z.string().uuid(), display_name:z.string(), disambiguation_index:z.number().int(),
    joined_at:z.string(), last_seen:z.string(), created_at:z.string(),
  }),
});