import { z } from 'zod';

export type QueueStatus = 'pending' | 'preparing' | 'singing' | 'completed' | 'cancelled';

export interface QueueEntry {
  id: string;
  sessionId: string;
  participantId: string;
  songTitle: string;
  artist: string;
  status: QueueStatus;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActiveQueueEntry extends QueueEntry {
  participantName: string; // Joined from the participants table in UI or DB queries
}

export const requestSongSchema = z.object({
  songTitle: z.string().trim().min(1, 'O título da música é obrigatório').max(100, 'O título deve ter no máximo 100 caracteres'),
  artist: z.string().trim().min(1, 'O artista é obrigatório').max(100, 'O artista deve ter no máximo 100 caracteres'),
});

export type RequestSongInput = z.infer<typeof requestSongSchema>;

export const queueEntryRpcRowSchema = z.strictObject({
  id:z.string().uuid(), session_id:z.string().uuid(), participant_id:z.string().uuid(), song_title:z.string(), artist:z.string(),
  status:z.enum(['pending','preparing','singing','completed','cancelled']), position:z.number().int(), created_at:z.string(), updated_at:z.string(),
});
export const activeQueueRpcRowSchema = z.strictObject({
  id:z.string().uuid(), session_id:z.string().uuid(), participant_id:z.string().uuid(), song_title:z.string(), artist:z.string(),
  status:z.enum(['pending','preparing','singing']), position:z.number().int(), created_at:z.string(), updated_at:z.string(),
  participant_name:z.string().min(1),
});
export const updateQueueStatusRpcRowSchema = z.strictObject({
  id:z.string().uuid(), status:z.enum(['pending','preparing','singing','completed','cancelled']), updated_at:z.string(), changed:z.boolean(),
});
export type UpdateQueueStatusResult = { id:string; status:QueueStatus; updatedAt:string; changed:boolean };