import { describe, expect, it } from 'vitest';
import { parseSessionRealtimeEnvelope } from '../session-lifecycle';

const row = { id:'11111111-1111-4111-8111-111111111111', code:'ABC234', status:'closed' as const, closed_at:'2026-07-31T12:00:00.000Z' };
const envelope = { eventType:'UPDATE', schema:'public', table:'sessions', commit_timestamp:'2026-07-31T12:00:00Z', new:row, old:{status:'active'}, errors:[] };

describe('Session Realtime envelope', () => {
  it('aceita envelope válido e old parcial', () => expect(parseSessionRealtimeEnvelope(envelope).new).toEqual(row));
  const invalidCases: Array<{ value: unknown; field: string }> = [
    { value: { ...envelope, new: { ...row, host_id: 'secret' } }, field: 'host_id' },
    { value: { ...envelope, new: { ...row, unexpected: true } }, field: 'unexpected' },
    { value: { ...envelope, schema: 'private' }, field: 'schema' },
    { value: { ...envelope, table: 'participants' }, field: 'table' },
    { value: { ...envelope, eventType: 'INSERT' }, field: 'eventType' },
  ];

  it.each(invalidCases)('rejeita payload inválido em $field', ({ value }) => {
    expect(() => parseSessionRealtimeEnvelope(value)).toThrow();
  });
  it('não rejeita metadados válidos adicionais do envelope', () => expect(parseSessionRealtimeEnvelope({...envelope, latency:12}).eventType).toBe('UPDATE'));
});
