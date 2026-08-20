export type ErrorCode =
  | 'AUTH_FAILED'
  | 'AUTH_REQUIRED'
  | 'CODE_GENERATION_FAILED'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_NOT_FOUND_OR_FORBIDDEN'
  | 'SESSION_CLOSED'
  | 'SESSION_PAUSED'
  | 'SESSION_FULL'
  | 'INVALID_CODE_FORMAT'
  | 'INVALID_NAME'
  | 'INVALID_SONG'
  | 'PARTICIPANT_NOT_FOUND'
  | 'PARTICIPANT_NOT_FOUND_OR_FORBIDDEN'
  | 'ACTIVE_SONG_EXISTS'
  | 'QUEUE_FULL'
  | 'INVALID_STATUS_TRANSITION'
  | 'UNAUTHORIZED'
  | 'QUEUE_ENTRY_NOT_FOUND'
  | 'QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN'
  | 'RPC_RESULT_CARDINALITY'
  | 'RPC_RESULT_INVALID'
  | 'RESPONSE_UNCERTAIN'
  | 'PAIRING_CODE_INVALID'
  | 'PAIRING_NOT_FOUND_OR_FORBIDDEN'
  | 'UNKNOWN';

export const USER_MESSAGES: Record<ErrorCode, string> = {
  AUTH_FAILED: 'Falha na autenticação.',
  AUTH_REQUIRED: 'Você precisa estar conectado para realizar esta ação.',
  CODE_GENERATION_FAILED: 'Falha ao gerar código da sala.',
  SESSION_NOT_FOUND: 'Sala não encontrada.',
  SESSION_NOT_FOUND_OR_FORBIDDEN: 'Sala não encontrada ou indisponível.',
  SESSION_CLOSED: 'Esta sala já foi encerrada.',
  SESSION_PAUSED: 'A fila está pausada. Aguarde o DJ reabrir.',
  SESSION_FULL: 'A sala está cheia.',
  INVALID_CODE_FORMAT: 'Código inválido.',
  INVALID_NAME: 'Nome inválido.',
  INVALID_SONG: 'Informe uma música e um artista válidos.',
  PARTICIPANT_NOT_FOUND: 'Participante não encontrado.',
  PARTICIPANT_NOT_FOUND_OR_FORBIDDEN: 'Participante não encontrado ou indisponível.',
  ACTIVE_SONG_EXISTS: 'Você já tem uma música na fila! Aguarde sua vez.',
  QUEUE_FULL: 'A fila está cheia no momento.',
  INVALID_STATUS_TRANSITION: 'Não é possível realizar essa alteração de status.',
  UNAUTHORIZED: 'Você não tem permissão para realizar esta ação.',
  QUEUE_ENTRY_NOT_FOUND: 'Música não encontrada.',
  QUEUE_ENTRY_NOT_FOUND_OR_FORBIDDEN: 'Música não encontrada ou indisponível.',
  RPC_RESULT_CARDINALITY: 'O servidor retornou uma resposta inesperada.',
  RPC_RESULT_INVALID: 'O servidor retornou dados inválidos.',
  RESPONSE_UNCERTAIN: 'Não foi possível confirmar o resultado. Reconecte para verificar antes de tentar novamente.',
  PAIRING_CODE_INVALID: 'Código de pareamento inválido ou expirado.',
  PAIRING_NOT_FOUND_OR_FORBIDDEN: 'Pareamento não encontrado ou indisponível.',
  UNKNOWN: 'Ocorreu um erro inesperado.',
};

export type AppError = { ok: false; code: ErrorCode; userMessage: string };
export type AppSuccess<T = void> = T extends void ? { ok: true } : { ok: true } & T;
