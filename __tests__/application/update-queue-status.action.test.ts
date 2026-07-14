import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateQueueStatusAction } from '../../src/application/queue/update-queue-status.action';
import { createSupabaseServerClient } from '../../src/infrastructure/supabase/server';

vi.mock('../../src/infrastructure/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe('updateQueueStatusAction', () => {
  const mockUpdate = vi.fn();
  const mockEq = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockEq.mockResolvedValue({ error: null });

    (createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'host-123' } } }),
      },
      from: vi.fn().mockReturnValue({
        update: mockUpdate,
      }),
    });
  });

  it('updates the status of a queue entry successfully', async () => {
    const result = await updateQueueStatusAction('queue-123', 'singing');
    
    expect(result.ok).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'singing' });
    expect(mockEq).toHaveBeenCalledWith('id', 'queue-123');
  });

  it('returns error if user is not authenticated', async () => {
    (createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    });

    const result = await updateQueueStatusAction('queue-123', 'singing');
    
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('UNAUTHORIZED');
    }
  });

  it('returns error if supabase update fails', async () => {
    mockEq.mockResolvedValue({ error: { message: 'Database error' } });

    const result = await updateQueueStatusAction('queue-123', 'singing');
    
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('UNKNOWN');
    }
  });
});
