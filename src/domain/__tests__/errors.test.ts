import { describe, it, expect } from 'vitest';
import { USER_MESSAGES, ErrorCode } from '../errors.types';

describe('errors.types', () => {
  it('every error code has a non-empty string message', () => {
    const codes: ErrorCode[] = [
      'AUTH_FAILED',
      'CODE_GENERATION_FAILED',
      'SESSION_NOT_FOUND',
      'SESSION_CLOSED',
      'SESSION_PAUSED',
      'SESSION_FULL',
      'INVALID_CODE_FORMAT',
      'INVALID_NAME',
      'PARTICIPANT_NOT_FOUND',
      'UNKNOWN',
    ];
    codes.forEach(code => {
      expect(typeof USER_MESSAGES[code]).toBe('string');
      expect(USER_MESSAGES[code].length).toBeGreaterThan(0);
    });
  });
});
