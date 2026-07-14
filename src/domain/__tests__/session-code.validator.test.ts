import { describe, it, expect } from 'vitest';
import { validateSessionCode, normalizeCode } from '../validators/session-code.validator';

describe('session-code.validator', () => {
  it('normalizeCode trims and uppercases', () => {
    expect(normalizeCode(' abc ')).toBe('ABC');
  });

  it('validateSessionCode passes valid code', () => {
    expect(validateSessionCode('A2B3C4')).toBe('A2B3C4');
  });

  it('validateSessionCode fails on code < 6 chars', () => {
    expect(() => validateSessionCode('ABC')).toThrow();
  });

  it('validateSessionCode fails on code > 6 chars', () => {
    expect(() => validateSessionCode('ABCDEFG')).toThrow();
  });

  it('validateSessionCode normalizes lowercase', () => {
    expect(validateSessionCode('a2b3c4')).toBe('A2B3C4');
  });

  it('validateSessionCode fails on ambiguous or invalid chars (0/O/1/I)', () => {
    expect(() => validateSessionCode('A0B3C4')).toThrow();
    expect(() => validateSessionCode('A1B3C4')).toThrow();
    expect(() => validateSessionCode('AOB3C4')).toThrow();
    expect(() => validateSessionCode('AIB3C4')).toThrow();
  });

  it('validateSessionCode fails on empty string', () => {
    expect(() => validateSessionCode('')).toThrow();
  });
});
