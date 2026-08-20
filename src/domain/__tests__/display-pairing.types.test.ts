import { describe, expect, it } from 'vitest';
import {
  displaySessionDetailsRpcRowSchema,
  generateDisplayPairingCodeRpcRowSchema,
  pairedDisplayRpcRowSchema,
  redeemDisplayPairingCodeRpcRowSchema,
  revokeDisplayPairingRpcRowSchema,
} from '@/src/domain/display-pairing.types';

describe('generateDisplayPairingCodeRpcRowSchema', () => {
  it('aceita a linha válida da RPC', () => {
    const parsed = generateDisplayPairingCodeRpcRowSchema.safeParse({
      code: 'ABCDEF',
      expires_at: '2026-08-17T12:05:00+00:00',
    });
    expect(parsed.success).toBe(true);
  });
  it('rejeita código com tamanho diferente de 6', () => {
    expect(generateDisplayPairingCodeRpcRowSchema.safeParse({ code: 'ABC', expires_at: '2026-08-17T12:05:00+00:00' }).success).toBe(false);
  });
  it('rejeita campo extra (strictObject)', () => {
    expect(generateDisplayPairingCodeRpcRowSchema.safeParse({ code: 'ABCDEF', expires_at: '2026-08-17T12:05:00+00:00', session_id: 'x' }).success).toBe(false);
  });
});

describe('redeemDisplayPairingCodeRpcRowSchema', () => {
  it('aceita a linha válida da RPC', () => {
    const parsed = redeemDisplayPairingCodeRpcRowSchema.safeParse({
      session_id: '20000000-0000-4000-8000-000000000001',
      paired: true,
    });
    expect(parsed.success).toBe(true);
  });
  it('rejeita session_id que não é uuid', () => {
    expect(redeemDisplayPairingCodeRpcRowSchema.safeParse({ session_id: 'not-a-uuid', paired: true }).success).toBe(false);
  });
});

describe('displaySessionDetailsRpcRowSchema', () => {
  it('aceita closed_at nulo', () => {
    const parsed = displaySessionDetailsRpcRowSchema.safeParse({
      id: '20000000-0000-4000-8000-000000000001',
      code: 'ABCDEF',
      status: 'active',
      closed_at: null,
    });
    expect(parsed.success).toBe(true);
  });
  it('aceita status closed com closed_at preenchido', () => {
    const parsed = displaySessionDetailsRpcRowSchema.safeParse({
      id: '20000000-0000-4000-8000-000000000001',
      code: 'ABCDEF',
      status: 'closed',
      closed_at: '2026-08-17T12:05:00+00:00',
    });
    expect(parsed.success).toBe(true);
  });
  it('rejeita status fora do enum', () => {
    expect(displaySessionDetailsRpcRowSchema.safeParse({ id: '20000000-0000-4000-8000-000000000001', code: 'ABCDEF', status: 'ended', closed_at: null }).success).toBe(false);
  });
  it('rejeita host_id vazado (campo extra)', () => {
    expect(displaySessionDetailsRpcRowSchema.safeParse({
      id: '20000000-0000-4000-8000-000000000001', code: 'ABCDEF', status: 'active', closed_at: null, host_id: '20000000-0000-4000-8000-000000000002',
    }).success).toBe(false);
  });
});

describe('revokeDisplayPairingRpcRowSchema', () => {
  it('aceita a linha válida da RPC', () => {
    expect(revokeDisplayPairingRpcRowSchema.safeParse({ id: '20000000-0000-4000-8000-000000000001', revoked: false }).success).toBe(true);
  });
});

describe('pairedDisplayRpcRowSchema', () => {
  it('aceita a linha válida da RPC', () => {
    expect(pairedDisplayRpcRowSchema.safeParse({ id: '20000000-0000-4000-8000-000000000001', paired_at: '2026-08-17T12:05:00+00:00' }).success).toBe(true);
  });
  it('rejeita auth_user_id vazado (campo extra) — list_paired_displays nunca retorna identidade', () => {
    expect(pairedDisplayRpcRowSchema.safeParse({
      id: '20000000-0000-4000-8000-000000000001', paired_at: '2026-08-17T12:05:00+00:00', auth_user_id: '20000000-0000-4000-8000-000000000002',
    }).success).toBe(false);
  });
});
