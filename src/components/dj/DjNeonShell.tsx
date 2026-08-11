import type { ReactNode } from 'react';
import { VocalisNeonShell } from '@/src/components/vocalis/VocalisNeonShell';

export function DjNeonShell({ children }: { children: ReactNode }) {
  return <VocalisNeonShell variant="dj">{children}</VocalisNeonShell>;
}
