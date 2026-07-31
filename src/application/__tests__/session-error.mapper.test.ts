import { describe, expect, it } from 'vitest';
import { mapSessionError } from '@/src/application/session/session-error.mapper';

describe('mapSessionError', () => {
  it('traduz SESSION_CLOSED sem expor detalhes internos', () => {
    expect(mapSessionError(new Error('SESSION_CLOSED: internal')).userMessage).toBe('Esta sala já foi encerrada.');
  });
  it('mantém inexistente/não proprietário indistinguível', () => {
    expect(mapSessionError({ message: 'SESSION_NOT_FOUND_OR_FORBIDDEN' }).code).toBe('SESSION_NOT_FOUND_OR_FORBIDDEN');
  });
  it('sanitiza erros desconhecidos', () => {
    expect(mapSessionError(new Error('password=secret'))).toEqual({ ok:false, code:'UNKNOWN', userMessage:'Ocorreu um erro inesperado.' });
  });
});
