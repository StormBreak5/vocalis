import { AppError } from '../errors.types';

// I and O are accepted for backward compatibility with rooms generated before migration 014.
// New rooms continue to exclude ambiguous characters at the database boundary.
const ALPHABET = '^[A-Z2-9]{6}$';

export function normalizeCode(raw: string): string {
  return String(raw).trim().toUpperCase();
}

export function validateSessionCode(code: unknown): string {
  const normalized = normalizeCode(code as string);
  if (normalized.length !== 6 || !new RegExp(ALPHABET).test(normalized)) {
    const err: AppError = { ok: false, code: 'INVALID_CODE_FORMAT', userMessage: 'Código inválido.' };
    throw err;
  }
  return normalized;
}
