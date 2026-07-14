import { AppError } from '../errors.types';

export function normalizeDisplayName(raw: string): string {
  return String(raw).trim();
}

export function validateDisplayName(name: unknown): string {
  const normalized = normalizeDisplayName(name as string);
  if (!normalized || normalized.length < 1 || normalized.length > 32) {
    const err: AppError = { ok: false, code: 'INVALID_NAME', userMessage: 'Nome inválido.' };
    throw err;
  }
  return normalized;
}
