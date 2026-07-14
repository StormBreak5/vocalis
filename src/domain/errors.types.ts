export type ErrorCode = 
  | 'AUTH_FAILED'
  | 'CODE_GENERATION_FAILED'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_CLOSED'
  | 'SESSION_PAUSED'
  | 'SESSION_FULL'
  | 'INVALID_CODE_FORMAT'
  | 'INVALID_NAME'
  | 'PARTICIPANT_NOT_FOUND'
  | 'UNKNOWN';

export const USER_MESSAGES: Record<ErrorCode, string> = {
  AUTH_FAILED: 'Falha na autenticação.',
  CODE_GENERATION_FAILED: 'Falha ao gerar código da sala.',
  SESSION_NOT_FOUND: 'Sala não encontrada.',
  SESSION_CLOSED: 'Esta sala foi encerrada.',
  SESSION_PAUSED: 'A fila está pausada. Aguarde o DJ reabrir.',
  SESSION_FULL: 'Sala cheia. Limite de 50 participantes atingido.',
  INVALID_CODE_FORMAT: 'Código inválido.',
  INVALID_NAME: 'Nome inválido.',
  PARTICIPANT_NOT_FOUND: 'Participante não encontrado.',
  UNKNOWN: 'Ocorreu um erro desconhecido.',
};

export type AppError = {
  ok: false;
  code: ErrorCode;
  userMessage: string;
};

export type AppSuccess<T> = { ok: true } & T;
