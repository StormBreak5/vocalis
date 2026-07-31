import { describe, it, expect, vi, beforeEach } from 'vitest';
import { joinSessionAction } from '../participant/join-session.action';
import { createSupabaseServerClient } from '../../infrastructure/supabase/server';

vi.mock('../../infrastructure/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

interface MockSupabase {
  rpc: ReturnType<typeof vi.fn>;
  auth: {
    getUser: ReturnType<typeof vi.fn>;
    signInAnonymously: ReturnType<typeof vi.fn>;
  };
}

describe('joinSessionAction', () => {
  let mockSupabase: MockSupabase;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = {
      rpc: vi.fn(),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
        signInAnonymously: vi.fn().mockResolvedValue({ data: { user: { id: 'anon-123' } }, error: null }),
      }
    };
    vi.mocked(createSupabaseServerClient).mockResolvedValue(mockSupabase as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
  });

  it('returns INVALID_CODE_FORMAT for invalid code', async () => {
    const result = await joinSessionAction('123', 'John');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_CODE_FORMAT');
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it('returns INVALID_NAME for invalid name', async () => {
    const result = await joinSessionAction('AABB22', '');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_NAME');
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it('calls join_session RPC on valid inputs', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: {
        participant: {
          id: '22222222-2222-4222-8222-222222222222',
          session_id: '11111111-1111-4111-8111-111111111111',
          display_name: 'John',
          disambiguation_index: 1,
          joined_at: 'now',
          last_seen: 'now',
                    created_at: 'now',
        }
      },
      error: null,
    });

    const result = await joinSessionAction('AABB22', 'John');
    expect(result.ok).toBe(true);
    expect(mockSupabase.rpc).toHaveBeenCalledWith('join_session', { p_code: 'AABB22', p_display_name: 'John' });
    
    if (result.ok) {
      expect(result.participant.displayName).toBe('John');
      expect(result.isRecovered).toBe(false);
    }
  });

  it('maps SESSION_NOT_FOUND error', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'SESSION_NOT_FOUND' },
    });

    const result = await joinSessionAction('AABB22', 'John');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('SESSION_NOT_FOUND');
  });

  it('returns isRecovered true if user is already authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'host-123' } } });
    
    mockSupabase.rpc.mockResolvedValue({
      data: {
        participant: {
          id: '22222222-2222-4222-8222-222222222222',
          session_id: '11111111-1111-4111-8111-111111111111',
          display_name: 'John',
          disambiguation_index: 1,
          joined_at: 'now',
          last_seen: 'now',
                    created_at: 'now',
        }
      },
      error: null,
    });

    const result = await joinSessionAction('AABB22', 'John');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.isRecovered).toBe(true);
  });
});
