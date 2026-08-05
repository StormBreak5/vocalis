import Link from 'next/link';
import { MicVocal } from 'lucide-react';
import styles from './vocalis-marketing.module.css';

export function VocalisBrand({ compact = false, linked = false, heading = false }: { compact?: boolean; linked?: boolean; heading?: boolean }) {
  const content = (
    <>
      <span className={styles.brandMark} aria-hidden="true"><MicVocal size={compact ? 19 : 23} /></span>
      <span className={styles.brandName} role={heading ? 'heading' : undefined} aria-level={heading ? 2 : undefined}>Vocalis</span>
    </>
  );

  if (linked) {
    return <Link href="/" className={styles.brand} data-size={compact ? 'compact' : 'default'} aria-label="Vocalis — página inicial">{content}</Link>;
  }
  return <div className={styles.brand} data-size={compact ? 'compact' : 'default'}>{content}</div>;
}
