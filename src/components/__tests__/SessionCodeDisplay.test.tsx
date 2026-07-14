import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionCodeDisplay } from '../session/SessionCodeDisplay';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('SessionCodeDisplay', () => {
  const originalClipboard = navigator.clipboard;
  const originalShare = navigator.share;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      share: vi.fn().mockResolvedValue(undefined),
    });
    // @ts-ignore
    window.isSecureContext = true;
  });

  // Restore global objects if needed
  afterEach(() => {
    Object.assign(navigator, {
      clipboard: originalClipboard,
      share: originalShare,
    });
  });

  it('displays code correctly', () => {
    render(<SessionCodeDisplay code="AABB11" sessionId="123" />);
    expect(screen.getByText('AABB11')).toBeDefined();
  });

  it('copy button calls navigator.clipboard.writeText', async () => {
    render(<SessionCodeDisplay code="AABB11" sessionId="123" />);
    const copyBtn = screen.getByRole('button', { name: /Copiar/i });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('AABB11');
      expect(toast.success).toHaveBeenCalledWith('Código copiado!');
    });
  });

  it('share button calls navigator.share when available', async () => {
    render(<SessionCodeDisplay code="AABB11" sessionId="123" />);
    const shareBtn = screen.getByRole('button', { name: /Compartilhar/i });
    fireEvent.click(shareBtn);

    await waitFor(() => {
      expect(navigator.share).toHaveBeenCalledWith({
        title: 'Vocalis',
        text: 'Entrar no karaokê com o código: AABB11',
      });
      expect(toast.success).toHaveBeenCalledWith('Compartilhado com sucesso!');
    });
  });

  it('share button falls back to copy when navigator.share is missing', async () => {
    Object.assign(navigator, { share: undefined });
    render(<SessionCodeDisplay code="AABB11" sessionId="123" />);
    const shareBtn = screen.getByRole('button', { name: /Compartilhar/i });
    fireEvent.click(shareBtn);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('AABB11');
      expect(toast.success).toHaveBeenCalledWith('Código copiado!');
    });
  });
});
