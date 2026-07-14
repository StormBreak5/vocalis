import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cancelQueueEntryAction } from '../../src/application/queue/cancel-queue-entry.action';
import { createSupabaseServerClient } from '../../src/infrastructure/supabase/server';

vi.mock('../../src/infrastructure/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe('cancelQueueEntryAction', () => {
  const mockRpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockRpc.mockResolvedValue({ error: null });

    (createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-123' } } }),
      },
      rpc: mockRpc,
    });
  });

  it('cancels a queue entry successfully', async () => {
    const result = await cancelQueueEntryAction('queue-123');
    
    expect(result.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('cancel_queue_entry', { p_queue_id: 'queue-123' });
  });

  it('returns error if user is not authenticated', async () => {
    (createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    });

    const result = await cancelQueueEntryAction('queue-123');
    
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('UNAUTHORIZED');
    }
  });

  it('handles NOT_FOUND_OR_UNAUTHORIZED error', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'NOT_FOUND_OR_UNAUTHORIZED' } });

    const result = await cancelQueueEntryAction('queue-123');
    
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('UNAUTHORIZED');
    }
  });

  it('handles INVALID_STATUS_TRANSITION error', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'INVALID_STATUS_TRANSITION' } });

    const result = await cancelQueueEntryAction('queue-123');
    
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVALID_STATUS_TRANSITION');
    }
  });
});
