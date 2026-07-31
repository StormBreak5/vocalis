import { z } from 'zod';
import { sessionStatusSchema, type SessionRealtimeEnvelope, type SessionStatusSnapshot } from './session.types';

export const sessionRealtimeRowSchema = z.strictObject({
  id: z.string().uuid(),
  code: z.string().trim().length(6),
  status: sessionStatusSchema,
  closed_at: z.string().datetime({ offset: true }).nullable(),
}).superRefine((row, context) => {
  if ((row.status === 'closed') !== (row.closed_at !== null)) {
    context.addIssue({ code:'custom', message:'Status e closed_at incoerentes.' });
  }
});

const sessionRealtimeOldRowSchema = z.strictObject({
  id: z.string().uuid().optional(),
  code: z.string().trim().length(6).optional(),
  status: sessionStatusSchema.optional(),
  closed_at: z.string().datetime({ offset: true }).nullable().optional(),
});

export const sessionRealtimeEnvelopeSchema = z.object({
  eventType: z.literal('UPDATE'),
  schema: z.literal('public'),
  table: z.literal('sessions'),
  commit_timestamp: z.string().min(1),
  new: sessionRealtimeRowSchema,
  old: sessionRealtimeOldRowSchema,
  errors: z.array(z.string()),
}).passthrough();

export const sessionStatusRowSchema = sessionRealtimeRowSchema;

export function parseSessionRealtimeEnvelope(value: unknown): SessionRealtimeEnvelope {
  return sessionRealtimeEnvelopeSchema.parse(value) as SessionRealtimeEnvelope;
}

export function toSessionStatusSnapshot(value: unknown): SessionStatusSnapshot {
  const row = sessionStatusRowSchema.parse(value);
  return { id:row.id, code:row.code, status:row.status, closedAt:row.closed_at };
}
