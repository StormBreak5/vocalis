'use client';

import { ErrorScreen } from '@/src/components/system/ErrorScreen';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body>
        <ErrorScreen error={error} reset={reset} scope="global" />
      </body>
    </html>
  );
}
