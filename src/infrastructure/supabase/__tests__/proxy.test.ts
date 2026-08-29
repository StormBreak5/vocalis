import { describe, expect, it, vi, beforeEach } from 'vitest';

const getUser = vi.fn().mockResolvedValue({ data: { user: null }, error: null });
const createServerClient = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => {
    createServerClient(...args);
    return { auth: { getUser } };
  },
}));

import { NextRequest } from 'next/server';
import { updateSupabaseSession, isPrefetchRequest } from '@/src/infrastructure/supabase/proxy';

describe('updateSupabaseSession', () => {
  beforeEach(() => {
    getUser.mockClear();
    createServerClient.mockClear();
  });

  it('dispara o refresh do token via getUser()', async () => {
    await updateSupabaseSession(new NextRequest('https://vocalis.test/sala/ABC234'));
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it('passa cookies getAll/setAll para o client', async () => {
    await updateSupabaseSession(new NextRequest('https://vocalis.test/'));
    const [, , options] = createServerClient.mock.calls[0] as [
      unknown,
      unknown,
      { cookies: { getAll: unknown; setAll: unknown } },
    ];
    expect(typeof options.cookies.getAll).toBe('function');
    expect(typeof options.cookies.setAll).toBe('function');
  });
});

describe('isPrefetchRequest', () => {
  it('detecta prefetch do App Router', () => {
    const prefetch = new NextRequest('https://vocalis.test/sala/ABC234', {
      headers: { 'next-router-prefetch': '1' },
    });
    expect(isPrefetchRequest(prefetch)).toBe(true);

    const purpose = new NextRequest('https://vocalis.test/', {
      headers: { purpose: 'prefetch' },
    });
    expect(isPrefetchRequest(purpose)).toBe(true);
  });

  it('navegação normal não é prefetch', () => {
    expect(isPrefetchRequest(new NextRequest('https://vocalis.test/'))).toBe(false);
  });
});
