import { getHostSessionDetails, getSessionStatusRowByCode } from '@/src/infrastructure/supabase/queries/session.queries';
import { getParticipantsBySessionId } from '@/src/infrastructure/supabase/queries/participant.queries';
import { redirect } from 'next/navigation';
import { SessionCodeDisplay } from '@/src/components/session/SessionCodeDisplay';
import { CloseSessionButton } from '@/src/components/session/CloseSessionButton';
import { SessionLifecycleProvider } from '@/src/components/session/SessionLifecycleProvider';
import { SessionClosedDialog } from '@/src/components/session/SessionClosedDialog';
import { QueueList } from '@/src/components/queue/QueueList';
import { ParticipantsList } from '@/src/components/participant/ParticipantsList';

export default async function HostDashboardPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  
  const sessionStatus = await getSessionStatusRowByCode(code);

  if (!sessionStatus) {
    redirect(`/sala/${code}`);
  }

  const session = await getHostSessionDetails(sessionStatus.id);
  if (!session) {
    redirect(`/sala/${code}`);
  }

  const isClosed = session.status === 'closed';
  const participants = isClosed ? [] : await getParticipantsBySessionId(session.id);

  return (
    <SessionLifecycleProvider 
      sessionId={session.id} 
      initialSnapshot={{ id: session.id, code: session.code, status: session.status, closedAt: session.closedAt }}
    >
      <main className="flex-1 flex flex-col p-6 w-full max-w-lg mx-auto mt-12">
        <header className="mb-12">
          <h1 className="text-3xl font-black text-center tracking-tight mb-2">Painel do DJ</h1>
          <p className="text-center text-muted-foreground">Controle a fila e as músicas da sala.</p>
        </header>
        
        <SessionCodeDisplay code={session.code} />
        
        <div className="mt-8 flex justify-center w-full max-w-sm mx-auto">
          <CloseSessionButton />
        </div>

        <section className="mt-12">
          <QueueList sessionId={session.id} isHost={true} />
        </section>

        <ParticipantsList sessionId={session.id} initialParticipants={participants} />
        
        <SessionClosedDialog />
      </main>
    </SessionLifecycleProvider>
  );
}
