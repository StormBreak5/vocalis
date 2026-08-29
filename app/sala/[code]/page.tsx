import { getSessionStatus } from '@/src/application/session/get-session-status';
import { toSessionStatusSnapshot } from '@/src/domain/session-lifecycle';
import { getSessionStatusRowByCode } from '@/src/infrastructure/supabase/queries/session.queries';
import { getParticipantForSessionCode } from '@/src/infrastructure/supabase/queries/participant.queries';
import { JoinForm } from '@/src/components/participant/JoinForm';
import { Mic2 } from 'lucide-react';
import { SessionLifecycleProvider } from '@/src/components/session/SessionLifecycleProvider';
import { SessionClosedDialog } from '@/src/components/session/SessionClosedDialog';
import { ParticipantQueueExperience } from '@/src/components/participant/ParticipantQueueExperience';
import { generateRoomEntryQr } from '@/src/infrastructure/qr/room-entry-qr.server';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sala',
  robots: { index: false, follow: false },
};

export default async function GuestRoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const uppercaseCode = code.toUpperCase();

  const sessionStatusByCode = await getSessionStatusRowByCode(uppercaseCode);
  if (sessionStatusByCode?.status === 'closed') {
    const closedSnapshot = toSessionStatusSnapshot(sessionStatusByCode);

    return (
      <SessionLifecycleProvider
        sessionId={closedSnapshot.id}
        initialSnapshot={closedSnapshot}
      >
        <main className="flex-1 flex flex-col p-6 w-full max-w-lg mx-auto">
          <SessionClosedDialog />
        </main>
      </SessionLifecycleProvider>
    );
  }

  const participant = await getParticipantForSessionCode(uppercaseCode);
  const statusResult = participant ? await getSessionStatus(participant.sessionId) : null;
  const session = statusResult?.ok ? statusResult.snapshot : null;

  if (participant && !session) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-2xl font-bold mb-2">Sala indisponível</h1>
        <p className="text-muted-foreground">Não foi possível carregar esta sala. Tente novamente.</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="flex-1 flex flex-col p-6 w-full max-w-lg mx-auto">
        <header className="flex flex-col items-center text-center space-y-4 mb-10 mt-6">
          <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center">
            <Mic2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-black tracking-tight">Entrar na Sala</h1>
          <p className="text-muted-foreground">Digite o código exibido pelo DJ.</p>
        </header>
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <JoinForm initialCode={uppercaseCode} />
        </div>
      </main>
    );
  }

  const isClosed = session.status === 'closed';
  return (
    <SessionLifecycleProvider 
      sessionId={session.id} 
      initialSnapshot={{ id: session.id, code: session.code, status: session.status, closedAt: session.closedAt }}
    >
      {participant && !isClosed ? (
        <ParticipantQueueExperience
          sessionId={session.id}
          roomCode={uppercaseCode}
          participant={participant}
          qr={generateRoomEntryQr(uppercaseCode)}
        />
      ) : (
        <main className="flex-1 flex flex-col p-6 w-full max-w-lg mx-auto">
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <JoinForm initialCode={uppercaseCode} />
          </div>
        </main>
      )}
      <SessionClosedDialog />
    </SessionLifecycleProvider>
  );
}
