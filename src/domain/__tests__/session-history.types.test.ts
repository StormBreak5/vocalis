import { describe, expect, it } from 'vitest';
import { listHostSessionsRpcRowSchema } from '@/src/domain/session-history.types';

const validRow = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'ABC234',
  status: 'closed' as const,
  created_at: '2026-08-01T10:00:00Z',
  closed_at: '2026-08-01T12:00:00Z',
  song_count: 2,
  participant_count: 3,
};

describe('listHostSessionsRpcRowSchema', () => {
  it('aceita uma linha bem formada', () => {
    expect(listHostSessionsRpcRowSchema.safeParse(validRow).success).toBe(true);
  });

  it('aceita closed_at nulo (sessão ainda não encerrada)', () => {
    expect(listHostSessionsRpcRowSchema.safeParse({ ...validRow, closed_at: null }).success).toBe(true);
  });

  it('rejeita campo faltando', () => {
    const { id, code, status, created_at, closed_at } = validRow;
    expect(listHostSessionsRpcRowSchema.safeParse({ id, code, status, created_at, closed_at }).success).toBe(false);
  });

  it('rejeita campo extra (z.strictObject)', () => {
    expect(listHostSessionsRpcRowSchema.safeParse({ ...validRow, host_id: 'leaked' }).success).toBe(false);
  });

  it('rejeita song_count negativo', () => {
    expect(listHostSessionsRpcRowSchema.safeParse({ ...validRow, song_count: -1 }).success).toBe(false);
  });
});
