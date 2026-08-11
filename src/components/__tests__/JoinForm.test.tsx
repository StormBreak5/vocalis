import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { JoinForm } from '../participant/JoinForm';
import * as useOnlineStatusModule from '@/src/hooks/useOnlineStatus';
import * as joinSessionActionModule from '@/src/application/participant/join-session.action';
import { toast } from 'sonner';
import { replaceDocument } from '@/src/lib/browser-navigation';

vi.mock('@/src/lib/browser-navigation', () => ({ replaceDocument: vi.fn() }));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/src/application/participant/join-session.action', () => ({
  joinSessionAction: vi.fn(),
}));

describe('JoinForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders both fields with accessible labels', () => {
    vi.spyOn(useOnlineStatusModule, 'useOnlineStatus').mockReturnValue({ isOnline: true });
    render(<JoinForm />);
    
    expect(screen.getByLabelText(/Código da Sala/i)).toBeDefined();
    expect(screen.getByLabelText(/Seu Nome/i)).toBeDefined();
  });

  it('code field normalizes to uppercase', () => {
    vi.spyOn(useOnlineStatusModule, 'useOnlineStatus').mockReturnValue({ isOnline: true });
    render(<JoinForm />);
    
    const codeInput = screen.getByLabelText(/Código da Sala/i) as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: 'aabb11' } });
    
    expect(codeInput.value).toBe('AABB11');
  });

  it('empty name shows inline error before submit', async () => {
    vi.spyOn(useOnlineStatusModule, 'useOnlineStatus').mockReturnValue({ isOnline: true });
    vi.spyOn(joinSessionActionModule, 'joinSessionAction').mockResolvedValue({
      ok: false,
      code: 'INVALID_NAME',
      userMessage: 'Nome inválido.',
    });

    render(<JoinForm />);
    
    const codeInput = screen.getByLabelText(/Código da Sala/i);
    fireEvent.change(codeInput, { target: { value: 'AABB22' } });

    const submitBtn = screen.getByRole('button', { name: /Entrar na sala/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const errorMsg = screen.getByText('Nome inválido.');
      expect(errorMsg).toBeDefined();
    });
  });

  it('submit disabled when offline', () => {
    vi.spyOn(useOnlineStatusModule, 'useOnlineStatus').mockReturnValue({ isOnline: false });
    render(<JoinForm />);
    
    const submitBtn = screen.getByRole('button') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    expect(submitBtn.getAttribute('aria-label')).toBe('Ação indisponível offline');
  });

  it('toast shown for SESSION_NOT_FOUND error', async () => {
    vi.spyOn(useOnlineStatusModule, 'useOnlineStatus').mockReturnValue({ isOnline: true });
    vi.spyOn(joinSessionActionModule, 'joinSessionAction').mockResolvedValue({
      ok: false,
      code: 'SESSION_NOT_FOUND',
      userMessage: 'Sala não encontrada.',
    });

    render(<JoinForm />);
    
    const codeInput = screen.getByLabelText(/Código da Sala/i);
    const nameInput = screen.getByLabelText(/Seu Nome/i);
    
    fireEvent.change(codeInput, { target: { value: 'AABB22' } });
    fireEvent.change(nameInput, { target: { value: 'John' } });

    const submitBtn = screen.getByRole('button', { name: /Entrar na sala/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Sala não encontrada.');
    });
  });

  it('uses a full document navigation after joining', async () => {
    vi.spyOn(useOnlineStatusModule, 'useOnlineStatus').mockReturnValue({ isOnline: true });
    vi.spyOn(joinSessionActionModule, 'joinSessionAction').mockResolvedValue({
      ok: true,
      isRecovered: false,
      participant: {
        id: 'participant-1',
        sessionId: 'session-1',
        displayName: 'Maria',
        disambiguationIndex: 1,
        joinedAt: 'now',
        lastSeen: 'now',
        createdAt: 'now',
      },
    });

    render(<JoinForm variant="standalone" />);
    fireEvent.change(screen.getByLabelText(/Código da Sala/i), { target: { value: 'AABB22' } });
    fireEvent.change(screen.getByLabelText(/Seu Nome/i), { target: { value: 'Maria' } });
    fireEvent.click(screen.getByRole('button', { name: /Entrar na sala/i }));

    await waitFor(() => expect(replaceDocument).toHaveBeenCalledWith('/sala/AABB22'));
  });

  it('restores the form when the server action rejects', async () => {
    vi.spyOn(useOnlineStatusModule, 'useOnlineStatus').mockReturnValue({ isOnline: true });
    vi.spyOn(joinSessionActionModule, 'joinSessionAction').mockRejectedValue(new Error('stale action'));

    render(<JoinForm variant="standalone" />);
    fireEvent.change(screen.getByLabelText(/Código da Sala/i), { target: { value: 'AABB22' } });
    fireEvent.change(screen.getByLabelText(/Seu Nome/i), { target: { value: 'Maria' } });
    fireEvent.click(screen.getByRole('button', { name: /Entrar na sala/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
      expect(screen.getByRole('alert').textContent).toContain('A entrada demorou demais.');
      expect((screen.getByRole('button', { name: /Entrar na sala/i }) as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it('stops loading when the server action does not respond', async () => {
    vi.useFakeTimers();
    vi.spyOn(useOnlineStatusModule, 'useOnlineStatus').mockReturnValue({ isOnline: true });
    vi.spyOn(joinSessionActionModule, 'joinSessionAction').mockReturnValue(new Promise(() => undefined));

    render(<JoinForm variant="standalone" />);
    fireEvent.change(screen.getByLabelText(/Código da Sala/i), { target: { value: 'AABB22' } });
    fireEvent.change(screen.getByLabelText(/Seu Nome/i), { target: { value: 'Maria' } });
    fireEvent.click(screen.getByRole('button', { name: /Entrar na sala/i }));
    expect(screen.getByText('Entrando...')).toBeDefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(toast.error).toHaveBeenCalled();
    expect((screen.getByRole('button', { name: /Entrar na sala/i }) as HTMLButtonElement).disabled).toBe(false);
  });
});
