import { USER_MESSAGES, type AppError, type ErrorCode } from '@/src/domain/errors.types';

const DOMAIN_CODES: ErrorCode[] = [
  'AUTH_FAILED','AUTH_REQUIRED','CODE_GENERATION_FAILED','SESSION_RATE_LIMIT','SESSION_NOT_FOUND_OR_FORBIDDEN','SESSION_NOT_FOUND','SESSION_CLOSED','SESSION_PAUSED','SESSION_FULL','INVALID_CODE_FORMAT','INVALID_NAME','INVALID_SONG','PARTICIPANT_NOT_FOUND_OR_FORBIDDEN','PARTICIPANT_NOT_FOUND','ACTIVE_SONG_EXISTS','QUEUE_FULL','INVALID_STATUS_TRANSITION','QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN','QUEUE_ENTRY_NOT_FOUND','INVALID_QUEUE_ORDER','RPC_RESULT_CARDINALITY','RPC_RESULT_INVALID','RESPONSE_UNCERTAIN','UNAUTHORIZED','PAIRING_NOT_FOUND_OR_FORBIDDEN','PAIRING_CODE_INVALID',
];

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return '';
}

export function mapSessionError(error: unknown, fallback: ErrorCode = 'UNKNOWN'): AppError {
  const message = errorMessage(error);
  const code = DOMAIN_CODES.find((candidate) => message.includes(candidate)) ?? fallback;
  return { ok: false, code, userMessage: USER_MESSAGES[code] };
}
