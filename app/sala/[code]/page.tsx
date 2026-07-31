import { getSessionByCode } from '@/src/infrastructure/supabase/queries/session.queries';
import { getParticipantForSessionCode } from '@/src/infrastructure/supabase/queries/participant.queries';
import { JoinForm } from '@/src/components/participant/JoinForm';
import { ParticipantView } from '@/src/components/participant/ParticipantView';
import { ParticipantSkeleton } from '@/src/components/participant/ParticipantSkeleton';
import { RequestSongForm } from '@/src/components/queue/RequestSongForm';
import { QueueList } from '@/src/components/queue/QueueList';
import { Suspense } from 'react';
import { Mic2 } from 'lucide-react';
import { SessionLifecycleProvider } from '@/src/components/session/SessionLifecycleProvider';
import { SessionClosedDialog } from '@/src/components/session/SessionClosedDialog';

export default async function GuestRoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const uppercaseCode = code.toUpperCase();

  const session = await getSessionByCode(uppercaseCode);

  if (!session) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-2xl font-bold mb-2">Sala não encontrada</h1>
        <p className="text-muted-foreground">Verifique se o código foi digitado corretamente.</p>
      </main>
    );
  }

  const isClosed = session.status === 'closed';
  const participant = isClosed ? null : await getParticipantForSessionCode(uppercaseCode);

  return (
    <SessionLifecycleProvider 
      sessionId={session.id} 
      initialSnapshot={{ id: session.id, code: session.code, status: session.status, closedAt: session.closedAt }}
    >
      <main className="flex-1 flex flex-col p-6 w-full max-w-lg mx-auto">
        <header className="flex flex-col items-center text-center space-y-4 mb-10 mt-6">
          <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center">
            <Mic2 className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-black tracking-tight">Sala {uppercaseCode}</h1>
        </header>

        <Suspense fallback={<ParticipantSkeleton />}>
          {participant ? (
            <div className="space-y-6 flex-1 flex flex-col">
              <ParticipantView 
                participant={{ ...participant, isCurrentUser: true }} 
                session={{ code: session.code, status: session.status }} 
              />
              {/* A form handles adding songs, and the list handles the real-time queue. */}
              {/* The active song checking happens on server action and DB, but we could pass state if we wanted. */}
              {/* For now, QueueList renders the state independently. */}
              <RequestSongForm sessionId={session.id} />
              
              <div className="pt-6 border-t">
                <QueueList sessionId={session.id} currentParticipantId={participant.id} />
              </div>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <JoinForm initialCode={uppercaseCode} />
            </div>
          )}
        </Suspense>
        
        <SessionClosedDialog />
      </main>
    </SessionLifecycleProvider>
  );
}
