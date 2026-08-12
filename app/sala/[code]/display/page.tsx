import { redirect } from 'next/navigation';
import { DisplayClosedState } from '@/src/components/display/DisplayClosedState';
import { DisplayExperience } from '@/src/components/display/DisplayExperience';
import { DisplayShell } from '@/src/components/display/DisplayShell';
import { SessionLifecycleProvider } from '@/src/components/session/SessionLifecycleProvider';
import { normalizeCode, validateSessionCode } from '@/src/domain/validators/session-code.validator';
import { generateRoomEntryQr } from '@/src/infrastructure/qr/room-entry-qr.server';
import {
  getHostSessionDetails,
  getSessionStatusRowByCode,
} from '@/src/infrastructure/supabase/queries/session.queries';

export default async function PublicDisplayPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = normalizeCode(rawCode);
  const roomPath = `/sala/${encodeURIComponent(code)}`;

  try {
    validateSessionCode(code);
  } catch {
    redirect(roomPath);
  }

  const visibleSession = await getSessionStatusRowByCode(code);
  if (!visibleSession) redirect(roomPath);

  const ownedSession = await getHostSessionDetails(visibleSession.id);
  if (!ownedSession) redirect(roomPath);

  if (ownedSession.status === 'closed') {
    return (
      <DisplayShell>
        <DisplayClosedState />
      </DisplayShell>
    );
  }

  const qr = generateRoomEntryQr(ownedSession.code);

  return (
    <DisplayShell>
      <SessionLifecycleProvider
        sessionId={ownedSession.id}
        initialSnapshot={{
          id: ownedSession.id,
          code: ownedSession.code,
          status: ownedSession.status,
          closedAt: ownedSession.closedAt,
        }}
      >
        <DisplayExperience
          sessionId={ownedSession.id}
          code={ownedSession.code}
          qr={qr}
        />
      </SessionLifecycleProvider>
    </DisplayShell>
  );
}
