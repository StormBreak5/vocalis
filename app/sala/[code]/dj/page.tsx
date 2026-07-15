import { getSessionByCode } from '@/src/infrastructure/supabase/queries/session.queries';
import { getParticipantsBySessionId } from '@/src/infrastructure/supabase/queries/participant.queries';
import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';
import { redirect } from 'next/navigation';
import { SessionCodeDisplay } from '@/src/components/session/SessionCodeDisplay';
import { SessionStatusToggle } from '@/src/components/session/SessionStatusToggle';
import { QueueList } from '@/src/components/queue/QueueList';
import { ParticipantsList } from '@/src/components/participant/ParticipantsList';

export default async function HostDashboardPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  
  const session = await getSessionByCode(code);

  if (!session || session.status === 'closed') {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center text-muted-foreground">
        <h2>Esta sessão foi encerrada.</h2>
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user || user.id !== session.hostId) {
    redirect(`/sala/${code}`);
  }

  const participants = await getParticipantsBySessionId(session.id);

  return (
    <main className="flex-1 flex flex-col p-6 w-full max-w-lg mx-auto mt-12">
      <header className="mb-12">
        <h1 className="text-3xl font-black text-center tracking-tight mb-2">Painel do DJ</h1>
        <p className="text-center text-muted-foreground">Controle a fila e as músicas da sala.</p>
      </header>
      
      <SessionCodeDisplay code={session.code} />
      
      <div className="mt-8 flex justify-center">
        <SessionStatusToggle sessionId={session.id} initialStatus={session.status} />
      </div>

      <section className="mt-12">
        <QueueList sessionId={session.id} isHost={true} />
      </section>

      <ParticipantsList sessionId={session.id} initialParticipants={participants} />
    </main>
  );
}
