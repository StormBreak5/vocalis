import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { expectSingleRpcRow, RpcResultContractError } from '../expect-single-rpc-row';

const rowSchema = z.strictObject({ id: z.string().uuid() });
const row = { id: '11111111-1111-4111-8111-111111111111' };

describe('expectSingleRpcRow', () => {
  it.each([[], [row,row], null, row])('rejeita cardinalidade diferente de um: %j', (value) => {
    expect(() => expectSingleRpcRow(value,rowSchema)).toThrowError(RpcResultContractError);
    try { expectSingleRpcRow(value,rowSchema); } catch (error) { expect((error as RpcResultContractError).appError.code).toBe('RPC_RESULT_CARDINALITY'); }
  });
  it('retorna uma linha válida', () => expect(expectSingleRpcRow([row],rowSchema)).toEqual(row));
  it('rejeita schema inválido', () => {
    try { expectSingleRpcRow([{ id:'invalid' }],rowSchema); } catch (error) { expect((error as RpcResultContractError).appError.code).toBe('RPC_RESULT_INVALID'); }
  });
});
