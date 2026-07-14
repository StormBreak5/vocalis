import { getSessionByCode } from '@/src/infrastructure/supabase/queries/session.queries';
import { getParticipantsBySessionId } from '@/src/infrastructure/supabase/queries/participant.queries';
import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';
import { redirect } from 'next/navigation';
import { SessionCodeDisplay } from '@/src/components/session/SessionCodeDisplay';
import { formatParticipantLabel } from '@/src/domain/participant.utils';
import { Users } from 'lucide-react';

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
  const { data: { session: authSession } } = await supabase.auth.getSession();

  const userId = authSession?.user?.id;

  if (session.hostId !== userId) {
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

      <section className="mt-12">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Participantes
          </h2>
          <span className="text-sm text-muted-foreground font-medium bg-muted px-2.5 py-1 rounded-full">
            {participants.length}
          </span>
        </div>

        {participants.length === 0 ? (
          <div className="text-center p-8 border rounded-xl bg-card/50 text-muted-foreground">
            Ninguém entrou na sala ainda.
          </div>
        ) : (
          <ul className="space-y-3">
            {participants.map((p) => (
              <li key={p.id} className="p-4 border rounded-xl bg-card flex items-center justify-between">
                <span className="font-medium text-lg">
                  {formatParticipantLabel(p.displayName, p.disambiguationIndex)}
                </span>
                <span className="text-xs text-muted-foreground">
                  Entrou {new Date(p.joinedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
