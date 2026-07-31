import { describe, expect, it } from 'vitest';
import { parseSessionRealtimeEnvelope } from '../session-lifecycle';

const row = { id:'11111111-1111-4111-8111-111111111111', code:'ABC234', status:'closed' as const, closed_at:'2026-07-31T12:00:00.000Z' };
const envelope = { eventType:'UPDATE', schema:'public', table:'sessions', commit_timestamp:'2026-07-31T12:00:00Z', new:row, old:{status:'active'}, errors:[] };

describe('Session Realtime envelope', () => {
  it('aceita envelope válido e old parcial', () => expect(parseSessionRealtimeEnvelope(envelope).new).toEqual(row));
  it.each([
    [{...envelope,new:{...row,host_id:'secret'}},'host_id'],
    [{...envelope,new:{...row,unexpected:true}},'unexpected'],
    [{...envelope,schema:'private'},'schema'],
    [{...envelope,table:'participants'},'table'],
    [{...envelope,eventType:'INSERT'},'eventType'],
  ])('rejeita payload inválido %s', (value, _label) => expect(() => parseSessionRealtimeEnvelope(value)).toThrow());
  it('não rejeita metadados válidos adicionais do envelope', () => expect(parseSessionRealtimeEnvelope({...envelope, latency:12}).eventType).toBe('UPDATE'));
});
