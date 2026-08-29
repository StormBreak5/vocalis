import type { ReactNode } from 'react';
import styles from './system-screens.module.css';

interface SystemScreenProps {
  icon?: ReactNode;
  iconVariant?: 'danger' | 'neutral';
  title: string;
  description: string;
  actions?: ReactNode;
  'data-testid'?: string;
}

/**
 * Tela cheia neutra e autossuficiente para estados de sistema (erro, sala não
 * encontrada, offline). Sem hooks — pode ser usada por Server e Client Components,
 * inclusive por app/global-error.tsx (que não carrega globals.css).
 */
export function SystemScreen({
  icon,
  iconVariant = 'danger',
  title,
  description,
  actions,
  ...rest
}: SystemScreenProps) {
  return (
    <div className={styles.screen} data-testid={rest['data-testid']}>
      <div className={styles.content}>
        {icon ? (
          <span
            className={
              iconVariant === 'neutral'
                ? `${styles.icon} ${styles.iconNeutral}`
                : styles.icon
            }
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.description}>{description}</p>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
    </div>
  );
}

export { styles as systemScreenStyles };
