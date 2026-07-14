import { describe, it, expect } from 'vitest';
import { formatParticipantLabel } from '../participant.utils';

describe('formatParticipantLabel', () => {
  it('returns displayName only when disambiguationIndex is 1', () => {
    expect(formatParticipantLabel('João', 1)).toBe('João');
  });

  it('returns displayName #2 when disambiguationIndex is 2', () => {
    expect(formatParticipantLabel('João', 2)).toBe('João #2');
  });

  it('returns displayName #3 when disambiguationIndex is 3', () => {
    expect(formatParticipantLabel('Maria', 3)).toBe('Maria #3');
  });
});
