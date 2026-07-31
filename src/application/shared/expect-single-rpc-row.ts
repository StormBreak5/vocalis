import type { z } from 'zod';
import { USER_MESSAGES, type AppError } from '@/src/domain/errors.types';

export class RpcResultContractError extends Error {
  constructor(public readonly appError: AppError) { super(appError.code); }
}

export function expectSingleRpcRow<T>(data: unknown, schema: z.ZodType<T>): T {
  if (!Array.isArray(data) || data.length !== 1) {
    throw new RpcResultContractError({ ok:false, code:'RPC_RESULT_CARDINALITY', userMessage:USER_MESSAGES.RPC_RESULT_CARDINALITY });
  }
  const parsed = schema.safeParse(data[0]);
  if (!parsed.success) {
    throw new RpcResultContractError({ ok:false, code:'RPC_RESULT_INVALID', userMessage:USER_MESSAGES.RPC_RESULT_INVALID });
  }
  return parsed.data;
}
