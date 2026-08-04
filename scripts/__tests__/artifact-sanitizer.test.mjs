import { describe, expect, it } from 'vitest';
import { sanitizeArtifactText } from '../e2e/sanitize-artifacts.mjs';

describe('sanitização dos artifacts Playwright', () => {
  it('remove JWT, banco e tokens Supabase', () => {
    const jwt = 'aaaaaaaaaa.bbbbbbbbbb.cccccccccc';
    const source = [
      `Authorization: Bearer ${jwt}`,
      'postgresql://postgres:secret@127.0.0.1:54322/postgres',
      'sb_secret_local-example',
      '"refresh_token":"refresh-value"',
    ].join('\n');
    const sanitized = sanitizeArtifactText(source);

    expect(sanitized).not.toContain(jwt);
    expect(sanitized).not.toContain('postgres:secret');
    expect(sanitized).not.toContain('sb_secret_local-example');
    expect(sanitized).not.toContain('refresh-value');
    expect(sanitized).toContain('[REDACTED_');
  });
});
