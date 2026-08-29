import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { SystemScreen, systemScreenStyles as styles } from './SystemScreen';

export function NotFoundScreen() {
  return (
    <SystemScreen
      data-testid="not-found-screen"
      icon={<SearchX />}
      iconVariant="neutral"
      title="Página não encontrada"
      description="O endereço que você abriu não existe ou a sala já foi encerrada."
      actions={
        <Link href="/" className={styles.button}>
          Voltar ao início
        </Link>
      }
    />
  );
}
