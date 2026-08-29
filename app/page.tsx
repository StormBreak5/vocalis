import { Metadata } from 'next';
import { VocalisNeonShell } from '@/src/components/vocalis/VocalisNeonShell';
import { HomeHero } from '@/src/components/vocalis/HomeHero';
import { HomeBenefits } from '@/src/components/vocalis/HomeBenefits';
import { HomeActionPanel } from '@/src/components/vocalis/HomeActionPanel';
import styles from '@/src/components/vocalis/vocalis-marketing.module.css';

export const metadata: Metadata = {
  // `absolute` evita o template "%s \u00b7 Vocalis" do layout na home.
  // openGraph/twitter herdam do layout (t\u00edtulo e imagem j\u00e1 s\u00e3o os certos).
  title: { absolute: 'Vocalis \u2014 Karaok\u00ea ao Vivo' },
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
