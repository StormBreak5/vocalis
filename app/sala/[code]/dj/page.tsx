import { redirect } from 'next/navigation';
import { DjDashboardExperience } from '@/src/components/dj/DjDashboardExperience';
import { DjNeonShell } from '@/src/components/dj/DjNeonShell';
import { SessionClosedDialog } from '@/src/components/session/SessionClosedDialog';
import { SessionLifecycleProvider } from '@/src/components/session/SessionLifecycleProvider';
import { getParticipantsBySessionId } from '@/src/infrastructure/supabase/queries/participant.queries';
import {
  getHostSessionDetails,
  getSessionStatusRowByCode,
} from '@/src/infrastructure/supabase/queries/session.queries';

export default async function HostDashboardPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const sessionStatus = await getSessionStatusRowByCode(code);

  if (!sessionStatus) redirect(`/sala/${code}`);

  const session = await getHostSessionDetails(sessionStatus.id);
  if (!session) redirect(`/sala/${code}`);

  const participants = session.status === 'closed'
    ? []
    : await getParticipantsBySessionId(session.id);

  return (
    <DjNeonShell>
      <SessionLifecycleProvider
        sessionId={session.id}
        initialSnapshot={{
          id: session.id,
          code: session.code,
          status: session.status,
          closedAt: session.closedAt,
        }}
      >
        <DjDashboardExperience
          sessionId={session.id}
          roomCode={session.code}
          initialParticipants={participants}
        />
        <SessionClosedDialog appearance="neon" />
      </SessionLifecycleProvider>
    </DjNeonShell>
  );
}
