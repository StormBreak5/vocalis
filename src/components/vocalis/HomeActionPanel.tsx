import Link from 'next/link';
import { ArrowRight, Radio } from 'lucide-react';
import { CreateSessionButton } from '@/src/components/session/CreateSessionButton';
import styles from './vocalis-marketing.module.css';

export function HomeActionPanel() {
  return (
    <section className={styles.actionPanel} aria-labelledby="home-actions-title">
      <h2 id="home-actions-title">Comece a cantar</h2>
      <p>Crie a sala para controlar a noite ou entre com o código exibido pelo DJ.</p>
      <CreateSessionButton variant="neon" />
      <Link href="/entrar" className={styles.secondaryAction}>
        Entrar como cantor <ArrowRight size={18} aria-hidden="true" />
      </Link>
      <p className={styles.hostNote}><Radio size={14} aria-hidden="true" />Atualizações instantâneas.</p>
    </section>
  );
}
