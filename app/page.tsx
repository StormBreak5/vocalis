import { Metadata } from 'next';
import { VocalisNeonShell } from '@/src/components/vocalis/VocalisNeonShell';
import { HomeHero } from '@/src/components/vocalis/HomeHero';
import { HomeBenefits } from '@/src/components/vocalis/HomeBenefits';
import { HomeActionPanel } from '@/src/components/vocalis/HomeActionPanel';
import styles from '@/src/components/vocalis/vocalis-marketing.module.css';

export const metadata: Metadata = {
  title: 'Vocalis \u2014 Karaok\u00ea ao Vivo',
  description: 'Crie sua sala de karaok\u00ea ou entre na fila pelo celular.',
};

export default function Home() {
  return (
    <VocalisNeonShell variant="home">
      <div className={styles.homeGrid}>
        <HomeHero />
        <HomeActionPanel />
        <HomeBenefits />
      </div>
    </VocalisNeonShell>
  );
}
