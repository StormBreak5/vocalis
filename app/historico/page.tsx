import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/src/infrastructure/supabase/server';
import { listHostSessions } from '@/src/infrastructure/supabase/queries/session-history.queries';
import { HistorySessionList } from '@/src/components/history/HistorySessionList';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Histórico de sessões',
  robots: { index: false, follow: false },
};

export default async function HistoricoPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Sem sessão anônima nenhuma (browser frio, sem cookie): não há como criar
  // uma aqui — signInAnonymously() só roda dentro de Server Actions
  // (create-session/join-session/redeem-display-pairing-code), nunca durante
  // o render de uma Server Component. Uma identidade nova, por definição,
  // não é dona de nenhuma sessão — manda para a home.
  if (!user) redirect('/');

  const sessions = await listHostSessions();

  return <HistorySessionList sessions={sessions} />;
}
