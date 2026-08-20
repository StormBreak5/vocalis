import { z } from 'zod';
import { sessionStatusSchema } from '@/src/domain/session.types';

export const generateDisplayPairingCodeRpcRowSchema = z.strictObject({
  code: z.string().trim().length(6),
  expires_at: z.string().datetime({ offset: true }),
});

export const redeemDisplayPairingCodeRpcRowSchema = z.strictObject({
  session_id: z.string().uuid(),
  paired: z.boolean(),
});

export const displaySessionDetailsRpcRowSchema = z.strictObject({
  id: z.string().uuid(),
  code: z.string().trim().length(6),
  status: sessionStatusSchema,
  closed_at: z.string().datetime({ offset: true }).nullable(),
});

export const revokeDisplayPairingRpcRowSchema = z.strictObject({
  id: z.string().uuid(),
  revoked: z.boolean(),
});

export const pairedDisplayRpcRowSchema = z.strictObject({
  id: z.string().uuid(),
  paired_at: z.string().datetime({ offset: true }),
});

export type DisplayPairingCode = { code: string; expiresAt: string };
export type DisplayPairingRedeemResult = { sessionId: string; paired: boolean };
export type DisplaySessionDetails = { id: string; code: string; status: 'active' | 'paused' | 'closed'; closedAt: string | null };
export type DisplayPairingRevokeResult = { id: string; revoked: boolean };
export type PairedDisplaySummary = { id: string; pairedAt: string };
