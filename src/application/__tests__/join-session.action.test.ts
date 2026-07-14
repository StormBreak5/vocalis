import { describe, it, expect, vi, beforeEach } from 'vitest';
import { joinSessionAction } from '../participant/join-session.action';
import { createSupabaseServerClient } from '../../infrastructure/supabase/server';
import { cookies } from 'next/headers';

vi.mock('../../infrastructure/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

describe('joinSessionAction', () => {
  let mockSupabase: any;
  let mockCookies: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = {
      rpc: vi.fn(),
    };
    (createSupabaseServerClient as any).mockResolvedValue(mockSupabase);

    mockCookies = {
      get: vi.fn().mockReturnValue(undefined),
      set: vi.fn(),
    };
    (cookies as any).mockResolvedValue(mockCookies);
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
          id: 'p-123',
          session_id: 's-123',
          display_name: 'John',
          disambiguation_index: 1,
          joined_at: 'now',
          last_seen: 'now',
        },
        recovery_token: 'token123',
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

    expect(mockCookies.set).toHaveBeenCalledWith('vocalis_pid', expect.any(String), expect.any(Object));
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

  it('recovers participant if cookie is valid', async () => {
    mockCookies.get.mockReturnValue({
      value: JSON.stringify({ code: 'AABB22', participantId: 'p-123', recoveryToken: 'tok' }),
    });

    mockSupabase.rpc.mockResolvedValueOnce({
      data: {
        id: 'p-123',
        session_id: 's-123',
        display_name: 'John',
        disambiguation_index: 1,
        joined_at: 'now',
        last_seen: 'now',
      },
      error: null,
    });

    const result = await joinSessionAction('AABB22', 'John');
    expect(result.ok).toBe(true);
    expect(mockSupabase.rpc).toHaveBeenCalledWith('recover_participant', {
      p_participant_id: 'p-123',
      p_recovery_token: 'tok',
      p_code: 'AABB22',
    });
    if (result.ok) expect(result.isRecovered).toBe(true);
  });
});
