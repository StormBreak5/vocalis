import { Radio, ShieldCheck, Smartphone } from 'lucide-react';
import styles from './vocalis-marketing.module.css';

const benefits = [
  { icon: Radio, title: 'Fila em tempo real', copy: 'Acompanhe cada mudan\u00e7a ao vivo.' },
  { icon: ShieldCheck, title: 'Microfone Justo', copy: 'Uma m\u00fasica ativa por cantor.' },
  { icon: Smartphone, title: 'Feito para celular', copy: 'Poucos toques, mesmo no escuro.' },
];

export function HomeBenefits() {
  return (
    <section className={styles.benefits} aria-label={'Benef\u00edcios do Vocalis'}>
      {benefits.map(({ icon: Icon, title, copy }) => (
        <article className={styles.benefit} key={title}>
          <span className={styles.benefitIcon} aria-hidden="true"><Icon size={19} /></span>
          <div><strong>{title}</strong><span>{copy}</span></div>
        </article>
      ))}
    </section>
  );
}
