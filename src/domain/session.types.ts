import { z } from 'zod';

export const sessionStatusSchema = z.enum(['active', 'paused', 'closed']);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

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

export type ClosedSession = Session & { status: 'closed'; closedAt: string };
export type CloseSessionInput = { sessionId: string };
export type CloseSessionResult = { sessionId: string; status: 'closed'; closedAt: string; changed: boolean };
export type UpdateSessionStatusResult = { id: string; status: 'active' | 'paused'; changed: boolean };
export type HostSessionDetails = Omit<Session, 'hostId'>;

export type SessionRealtimeRow = {
  id: string;
  code: string;
  status: SessionStatus;
  closed_at: string | null;
};

export type SessionRealtimeEnvelope = {
  eventType: 'UPDATE';
  schema: 'public';
  table: 'sessions';
  commit_timestamp: string;
  new: SessionRealtimeRow;
  old: Partial<SessionRealtimeRow>;
  errors: string[];
};

export type SessionStatusSnapshot = {
  id: string;
  code: string;
  status: SessionStatus;
  closedAt: string | null;
};

export type SessionLifecyclePhase = 'loading' | 'connected' | 'reconnecting' | 'offline' | 'closed' | 'error';
export type SessionLifecycleState = {
  snapshot: SessionStatusSnapshot | null;
  phase: SessionLifecyclePhase;
  epoch: number;
  writesAllowed: boolean;
  error: string | null;
};

export const closeSessionRpcRowSchema = z.strictObject({
  session_id: z.string().uuid(), status: z.literal('closed'), closed_at: z.string().datetime({ offset:true }), changed: z.boolean(),
});
export const updateSessionStatusRpcRowSchema = z.strictObject({
  id: z.string().uuid(), status: z.enum(['active','paused']), changed: z.boolean(),
});
export const hostSessionDetailsRpcRowSchema = z.strictObject({
  id:z.string().uuid(), code:z.string().trim().length(6), status:sessionStatusSchema, closed_at:z.string().datetime({offset:true}).nullable(),
  created_at:z.string(), max_participants:z.number().int(), max_queue_entries:z.number().int(),
});