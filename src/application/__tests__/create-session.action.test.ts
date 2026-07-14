import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSessionAction } from '../session/create-session.action';
import { createSupabaseServerClient } from '../../infrastructure/supabase/server';

vi.mock('../../infrastructure/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

// Mock revalidatePath
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('createSessionAction', () => {
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        signInAnonymously: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null }),
      },
      rpc: vi.fn(),
    };
    (createSupabaseServerClient as any).mockResolvedValue(mockSupabase);
  });

  it('returns session on success (new anonymous user)', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: {
        id: 'session-123',
        code: 'A2B3C4',
        status: 'active',
        host_id: 'test-user-id',
        created_at: '2026-07-14',
        closed_at: null,
        max_participants: 50,
        max_queue_entries: 200,
      },
      error: null,
    });

    const result = await createSessionAction();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.code).toBe('A2B3C4');
      expect(result.session.hostId).toBe('test-user-id');
    }
  });

  it('returns AUTH_FAILED when signInAnonymously fails', async () => {
    mockSupabase.auth.signInAnonymously.mockResolvedValue({ data: {}, error: new Error('Auth failed') });
    
    const result = await createSessionAction();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('AUTH_FAILED');
    }
  });

  it('returns CODE_GENERATION_FAILED when RPC throws that code', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'CODE_GENERATION_FAILED' },
    });

    const result = await createSessionAction();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('CODE_GENERATION_FAILED');
    }
  });

  it('uses existing session if available', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'existing-user-id' } } } });
    mockSupabase.rpc.mockResolvedValue({
      data: {
        id: 'session-123',
        code: 'A2B3C4',
        status: 'active',
        host_id: 'existing-user-id',
        created_at: '2026-07-14',
        closed_at: null,
        max_participants: 50,
        max_queue_entries: 200,
      },
      error: null,
    });

    const result = await createSessionAction();
    expect(mockSupabase.auth.signInAnonymously).not.toHaveBeenCalled();
    expect(mockSupabase.rpc).toHaveBeenCalledWith('create_session', { p_host_id: 'existing-user-id' });
    expect(result.ok).toBe(true);
  });
});
