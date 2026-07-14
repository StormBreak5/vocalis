import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateSessionButton } from '../session/CreateSessionButton';
import * as useOnlineStatusModule from '@/src/hooks/useOnlineStatus';
import * as createSessionActionModule from '@/src/application/session/create-session.action';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

describe('CreateSessionButton', () => {
  let mockPush: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPush = vi.fn();
    (useRouter as any).mockReturnValue({ push: mockPush });
  });

  it('renders button with accessible label', () => {
    vi.spyOn(useOnlineStatusModule, 'useOnlineStatus').mockReturnValue({ isOnline: true });
    render(<CreateSessionButton />);
    const button = screen.getByRole('button', { name: /Criar nova sala de karaokê/i });
    expect(button).toBeDefined();
    expect(button.textContent).toContain('Criar Nova Sala');
  });

  it('button disabled when offline', () => {
    vi.spyOn(useOnlineStatusModule, 'useOnlineStatus').mockReturnValue({ isOnline: false });
    render(<CreateSessionButton />);
    const button = screen.getByRole('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-label')).toBe('Ação indisponível offline');
  });

  it('redirects on success', async () => {
    vi.spyOn(useOnlineStatusModule, 'useOnlineStatus').mockReturnValue({ isOnline: true });
    vi.spyOn(createSessionActionModule, 'createSessionAction').mockResolvedValue({
      ok: true,
      session: {
        id: '123',
        code: 'AABB11',
        status: 'active',
        hostId: 'host-1',
        createdAt: 'now',
        closedAt: null,
        maxParticipants: 50,
        maxQueueEntries: 200,
      }
    });

    render(<CreateSessionButton />);
    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/sala/AABB11/dj');
    });
  });

  it('shows toast on error', async () => {
    vi.spyOn(useOnlineStatusModule, 'useOnlineStatus').mockReturnValue({ isOnline: true });
    vi.spyOn(createSessionActionModule, 'createSessionAction').mockResolvedValue({
      ok: false,
      code: 'AUTH_FAILED',
      userMessage: 'Test error message',
    });

    render(<CreateSessionButton />);
    const button = screen.getByRole('button');
    fireEvent.click(button);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Test error message');
      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});
