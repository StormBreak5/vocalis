import { VocalisBrand } from './VocalisBrand';
import styles from './vocalis-marketing.module.css';

export function HomeHero() {
  return (
    <section className={styles.hero} aria-labelledby="home-title">
      <div className={styles.heroTopRow}>
        <VocalisBrand heading />
        <div className={styles.eyebrow}><span className={styles.liveDot} aria-hidden="true" />Experi&ecirc;ncia ao vivo</div>
      </div>
      <h1 id="home-title">Seu karaok&ecirc;, no ritmo certo.</h1>
      <p className={styles.heroCopy}>Entre na fila pelo celular e acompanhe sua vez em tempo real.</p>
    </section>
  );
}
