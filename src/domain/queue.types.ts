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
