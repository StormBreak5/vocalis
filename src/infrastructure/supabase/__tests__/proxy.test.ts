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
import { updateSupabaseSession } from '@/src/infrastructure/supabase/proxy';

describe('updateSupabaseSession', () => {
  beforeEach(() => {
    getUser.mockClear();
    createServerClient.mockClear();
  });

  it('dispara o refresh do token via getUser()', async () => {
    await updateSupabaseSession(new NextRequest('https://vocalis.test/sala/ABC234'));
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it('marca a resposta como não-cacheável', async () => {
    const response = await updateSupabaseSession(
      new NextRequest('https://vocalis.test/historico'),
    );
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });

  it('passa cookies getAll/setAll para o client', async () => {
    await updateSupabaseSession(new NextRequest('https://vocalis.test/'));
    const [, , options] = createServerClient.mock.calls[0] as [unknown, unknown, { cookies: { getAll: unknown; setAll: unknown } }];
    expect(typeof options.cookies.getAll).toBe('function');
    expect(typeof options.cookies.setAll).toBe('function');
  });
});
