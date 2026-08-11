import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateSessionButton } from '../session/CreateSessionButton';
import * as useOnlineStatusModule from '@/src/hooks/useOnlineStatus';
import * as createSessionActionModule from '@/src/application/session/create-session.action';
import { toast } from 'sonner';
import { replaceDocument } from '@/src/lib/browser-navigation';

vi.mock('@/src/lib/browser-navigation', () => ({ replaceDocument: vi.fn() }));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

describe('CreateSessionButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      expect(replaceDocument).toHaveBeenCalledWith('/sala/AABB11/dj');
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
      expect(replaceDocument).not.toHaveBeenCalled();
    });
  });

  it('restores the button when the server action rejects', async () => {
    vi.spyOn(useOnlineStatusModule, 'useOnlineStatus').mockReturnValue({ isOnline: true });
    vi.spyOn(createSessionActionModule, 'createSessionAction').mockRejectedValue(new Error('stale action'));

    render(<CreateSessionButton />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
      expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
    });
  });
});
