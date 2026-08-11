import { JoinForm } from '@/src/components/participant/JoinForm';
import { ArrowLeft, KeyRound, UserRound } from 'lucide-react';
import Link from 'next/link';
import { VocalisNeonShell } from '@/src/components/vocalis/VocalisNeonShell';
import { VocalisBrand } from '@/src/components/vocalis/VocalisBrand';
import styles from '@/src/components/vocalis/vocalis-marketing.module.css';
import {
  normalizeCode,
  validateSessionCode,
} from '@/src/domain/validators/session-code.validator';

type EntrarSearchParams = Promise<{
  codigo?: string | string[];
}>;

export function initialCodeFromSearchParam(value: string | readonly string[] | undefined): string {
  if (typeof value !== 'string') return '';
  const normalized = normalizeCode(value);
  try {
    return validateSessionCode(normalized);
  } catch {
    return '';
  }
}

export default async function EntrarPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: EntrarSearchParams;
} = {}) {
  const query = await searchParams;
  const initialCode = initialCodeFromSearchParam(query.codigo);

  return (
    <VocalisNeonShell variant="entry">
      <div className={styles.entryGrid}>
        <section className={styles.entryTop}>
          <Link href="/" className={styles.backLink}>
            <ArrowLeft size={17} aria-hidden="true" />
            Voltar para o in&iacute;cio
          </Link>
          <VocalisBrand compact linked />
          <div className={styles.entryIntro}>
            <h1>Entrar na sala</h1>
            <p>Informe seus dados para acompanhar a fila e saber exatamente quando chega a sua vez.</p>
          </div>
          <div className={styles.entryDetails} aria-label="Como funciona">
            <p className={styles.entryDetail}><KeyRound size={18} aria-hidden="true" /> O c&oacute;digo tem seis caracteres e aparece na tela do DJ.</p>
            <p className={styles.entryDetail}><UserRound size={18} aria-hidden="true" /> Seu apelido ser&aacute; vis&iacute;vel para as pessoas na sala.</p>
          </div>
        </section>

        <section className={styles.entryPanel} aria-labelledby="join-panel-title">
          <header className={styles.entryPanelHeader}>
            <h2 id="join-panel-title">Pronto para cantar?</h2>
            <p>Entre com o c&oacute;digo da sala e escolha como quer ser chamado.</p>
          </header>
          <JoinForm variant="standalone" initialCode={initialCode} />
        </section>
      </div>
    </VocalisNeonShell>
  );
}
