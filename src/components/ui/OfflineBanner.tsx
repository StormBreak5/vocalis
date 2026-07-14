'use client';

import { useOnlineStatus } from '@/src/hooks/useOnlineStatus';

export function OfflineBanner() {
  const { isOnline } = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 w-full bg-destructive text-destructive-foreground py-2 text-center text-sm font-semibold z-50"
    >
      Sem conexão. Visualizando dados salvos.
    </div>
  );
}
