import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OfflineBanner } from '../ui/OfflineBanner';
import * as useOnlineStatusModule from '@/src/hooks/useOnlineStatus';

describe('OfflineBanner', () => {
  it('renders nothing when online', () => {
    vi.spyOn(useOnlineStatusModule, 'useOnlineStatus').mockReturnValue({ isOnline: true });
    const { container } = render(<OfflineBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders banner when offline', () => {
    vi.spyOn(useOnlineStatusModule, 'useOnlineStatus').mockReturnValue({ isOnline: false });
    render(<OfflineBanner />);
    const banner = screen.getByRole('status');
    expect(banner).toBeDefined();
    expect(banner.textContent).toBe('Sem conexão. Visualizando dados salvos.');
    expect(banner.getAttribute('aria-live')).toBe('polite');
  });
});
