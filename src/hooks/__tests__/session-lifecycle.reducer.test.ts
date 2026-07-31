import { describe, expect, it } from 'vitest';
import { initialSessionLifecycleState, sessionLifecycleReducer } from '../session-lifecycle.reducer';

const active = { id:'11111111-1111-4111-8111-111111111111', code:'ABC234', status:'active' as const, closedAt:null };
const closed = { ...active, status:'closed' as const, closedAt:'2026-07-31T12:00:00Z' };

describe('sessionLifecycleReducer', () => {
  it('permite writes somente após snapshot open confirmado', () => expect(sessionLifecycleReducer(initialSessionLifecycleState,{type:'snapshot',snapshot:active}).writesAllowed).toBe(true));
  it('torna closed terminal e incrementa epoch', () => {
    const state=sessionLifecycleReducer(initialSessionLifecycleState,{type:'snapshot',snapshot:closed});
    expect(state).toMatchObject({phase:'closed',writesAllowed:false,epoch:1});
    expect(sessionLifecycleReducer(state,{type:'snapshot',snapshot:active})).toEqual(state);
  });
  it.each(['loading','reconnecting','offline'] as const)('é fail-closed em %s', (type) => expect(sessionLifecycleReducer({...initialSessionLifecycleState,snapshot:active},{type}).writesAllowed).toBe(false));
});
