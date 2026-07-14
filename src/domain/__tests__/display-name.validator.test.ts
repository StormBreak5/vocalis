import { describe, it, expect } from 'vitest';
import { validateDisplayName, normalizeDisplayName } from '../validators/display-name.validator';

describe('display-name.validator', () => {
  it('normalizeDisplayName trims', () => {
    expect(normalizeDisplayName(' abc ')).toBe('abc');
  });

  it('validateDisplayName fails on empty string', () => {
    expect(() => validateDisplayName('')).toThrow();
    expect(() => validateDisplayName('   ')).toThrow();
  });

  it('validateDisplayName passes 32-char name', () => {
    const name = 'A'.repeat(32);
    expect(validateDisplayName(name)).toBe(name);
  });

  it('validateDisplayName fails on 33-char name', () => {
    const name = 'A'.repeat(33);
    expect(() => validateDisplayName(name)).toThrow();
  });

  it('validateDisplayName trims leading/trailing spaces', () => {
    expect(validateDisplayName(' abc ')).toBe('abc');
  });

  it('validateDisplayName accepts emoji', () => {
    expect(validateDisplayName('João 🎶')).toBe('João 🎶');
  });
});
