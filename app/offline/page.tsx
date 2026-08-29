import type { Metadata } from 'next';
import { WifiOff } from 'lucide-react';
import { SystemScreen } from '@/src/components/system/SystemScreen';

export const metadata: Metadata = {
  title: 'Sem conexão',
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <SystemScreen
      data-testid="offline-screen"
      icon={<WifiOff />}
      iconVariant="neutral"
      title="Você está offline"
      description="Sem conexão no momento. Assim que a internet voltar, atualize a página para continuar."
    />
  );
}
