import { describe, it, expect, vi } from 'vitest';

describe('env.ts', () => {
  it('throws if NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'key');
    vi.resetModules();
    await expect(import('../env')).rejects.toThrow('Missing environment variable: NEXT_PUBLIC_SUPABASE_URL');
  });

  it('throws if NEXT_PUBLIC_SUPABASE_ANON_KEY is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'url');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.resetModules();
    await expect(import('../env')).rejects.toThrow('Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });

  it('exports variables if present', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'url');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'key');
    vi.resetModules();
    const { env } = await import('../env');
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('url');
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('key');
  });
});
