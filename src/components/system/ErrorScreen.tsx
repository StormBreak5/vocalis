'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import * as Sentry from '@sentry/nextjs';
import { SystemScreen, systemScreenStyles as styles } from './SystemScreen';

interface ErrorScreenProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Rotulo do escopo; ajuda a distinguir boundaries no Sentry. */
  scope?: string;
}

export function ErrorScreen({ error, reset, scope }: ErrorScreenProps) {
  useEffect(() => {
    Sentry.captureException(error, scope ? { tags: { boundary: scope } } : undefined);
  }, [error, scope]);

  return (
    <SystemScreen
      data-testid="error-screen"
      icon={<TriangleAlert />}
      title="Algo deu errado"
      description="Tivemos um problema ao carregar esta tela. Tente de novo — se continuar, volte ao início."
      actions={
        <>
          <button type="button" className={styles.button} onClick={() => reset()}>
            Tentar de novo
          </button>
          <Link href="/" className={`${styles.button} ${styles.buttonSecondary}`}>
            Voltar ao início
          </Link>
        </>
      }
    />
  );
}
