import { z } from 'zod';

export type QueueStatus = 'pending' | 'preparing' | 'singing' | 'completed' | 'cancelled';

export interface QueueEntry {
  id: string;
  sessionId: string;
  participantId: string;
  songTitle: string | null;
  artist: string | null;
  status: QueueStatus;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActiveQueueEntry extends QueueEntry {
  participantName: string; // Joined from the participants table in UI or DB queries
}

// Ninguém precisa saber o que vai cantar para entrar na fila — ambos os
// campos são opcionais e independentes. Uma string em branco é tratada como
// "não informado", não como erro de validação. `.nullish()` (em vez de só
// `.optional()`) é o que torna o schema idempotente de ponta a ponta: o
// campo ausente sai do formulário como `undefined`, mas a fronteira de
// Server Action (o transporte "Flight" do React) não preserva `undefined` —
// ele chega no servidor como `null`. Sem aceitar `null` aqui, a revalidação
// server-side com este MESMO schema rejeitaria o próprio output do
// zodResolver do cliente.
const optionalSongField = (label: string) => z.string()
  .trim()
  .max(100, `${label} deve ter no máximo 100 caracteres`)
  .nullish()
  .transform((value) => (value == null || value === '' ? undefined : value));

export const requestSongSchema = z.object({
  songTitle: optionalSongField('O título da música'),
  artist: optionalSongField('O artista'),
});

export type RequestSongFormValues = z.input<typeof requestSongSchema>;
export type RequestSongInput = z.infer<typeof requestSongSchema>;

export const queueEntryRpcRowSchema = z.strictObject({
  id:z.string().uuid(), session_id:z.string().uuid(), participant_id:z.string().uuid(), song_title:z.string().nullable(), artist:z.string().nullable(),
  status:z.enum(['pending','preparing','singing','completed','cancelled']), position:z.number().int(), created_at:z.string(), updated_at:z.string(),
});
export const activeQueueRpcRowSchema = z.strictObject({
  id:z.string().uuid(), session_id:z.string().uuid(), participant_id:z.string().uuid(), song_title:z.string().nullable(), artist:z.string().nullable(),
  status:z.enum(['pending','preparing','singing']), position:z.number().int(), created_at:z.string(), updated_at:z.string(),
  participant_name:z.string().min(1),
});
export const updateQueueStatusRpcRowSchema = z.strictObject({
  id:z.string().uuid(), status:z.enum(['pending','preparing','singing','completed','cancelled']), updated_at:z.string(), changed:z.boolean(),
});
export type UpdateQueueStatusResult = { id:string; status:QueueStatus; updatedAt:string; changed:boolean };

// Rótulos de apresentação para quando o cantor ainda não escolheu o que vai
// cantar. Usados por todas as superfícies (participante, Host, telão) para
// que "ainda não escolhido" tenha um único texto em vez de cada componente
// inventar o próprio fallback para null.
export const UNSPECIFIED_SONG_TITLE = 'Música a definir';
export const UNSPECIFIED_ARTIST = 'Artista a definir';

export function songTitleLabel(entry: Pick<QueueEntry, 'songTitle'>): string {
  return entry.songTitle ?? UNSPECIFIED_SONG_TITLE;
}

export function artistLabel(entry: Pick<QueueEntry, 'artist'>): string {
  return entry.artist ?? UNSPECIFIED_ARTIST;
}