import { systemScreenStyles as styles } from '@/src/components/system/SystemScreen';

export default function RoomLoading() {
  return (
    <div className={styles.screen}>
      <div className={styles.content}>
        <span className={styles.spinner} role="status" aria-label="Carregando" />
        <p className={styles.description}>Carregando a sala…</p>
      </div>
    </div>
  );
}
