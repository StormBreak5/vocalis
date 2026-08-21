import { z } from 'zod';
import { sessionStatusSchema } from './session.types';

export const listHostSessionsRpcRowSchema = z.strictObject({
  id: z.string().uuid(),
  code: z.string().trim().length(6),
  status: sessionStatusSchema,
  created_at: z.string(),
  closed_at: z.string().datetime({ offset: true }).nullable(),
  song_count: z.number().int().nonnegative(),
  participant_count: z.number().int().nonnegative(),
});

export type HostSessionHistoryEntry = {
  id: string;
  code: string;
  status: 'active' | 'paused' | 'closed';
  createdAt: string;
  closedAt: string | null;
  songCount: number;
  participantCount: number;
};
