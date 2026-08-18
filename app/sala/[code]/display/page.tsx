import { redirect } from 'next/navigation';
import { DisplayClosedState } from '@/src/components/display/DisplayClosedState';
import { DisplayExperience } from '@/src/components/display/DisplayExperience';
import { DisplayPairingScreen } from '@/src/components/display/DisplayPairingScreen';
import { DisplayShell } from '@/src/components/display/DisplayShell';
import { SessionLifecycleProvider } from '@/src/components/session/SessionLifecycleProvider';
import { getDisplaySessionDetails } from '@/src/application/display-pairing/get-display-session-details';
import { normalizeCode, validateSessionCode } from '@/src/domain/validators/session-code.validator';
import { generateRoomEntryQr } from '@/src/infrastructure/qr/room-entry-qr.server';
import { getSessionStatusRowByCode } from '@/src/infrastructure/supabase/queries/session.queries';

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

  // Both lookups below are indistinguishable on failure by design (FR-008):
  // a nonexistent room code, an unrelated/anonymous visitor (RLS denies
  // getSessionStatusRowByCode), a mere participant, and a revoked display
  // (RLS-authorized read but get_display_session_details still refuses) all
  // land on the pairing screen instead of a redirect. Only a malformed code
  // (rejected above) still redirects to the participant route.
  const visibleSession = await getSessionStatusRowByCode(code);
  const authorizedSession = visibleSession
    ? await getDisplaySessionDetails(visibleSession.id)
    : null;

  if (!authorizedSession) {
    return (
      <DisplayShell>
        <DisplayPairingScreen roomCode={code} />
      </DisplayShell>
    );
  }

  if (authorizedSession.status === 'closed') {
    return (
      <DisplayShell>
        <DisplayClosedState />
      </DisplayShell>
    );
  }

  const qr = generateRoomEntryQr(authorizedSession.code);

  return (
    <DisplayShell>
      <SessionLifecycleProvider
        sessionId={authorizedSession.id}
        initialSnapshot={{
          id: authorizedSession.id,
          code: authorizedSession.code,
          status: authorizedSession.status,
          closedAt: authorizedSession.closedAt,
        }}
      >
        <DisplayExperience
          sessionId={authorizedSession.id}
          code={authorizedSession.code}
          qr={qr}
        />
      </SessionLifecycleProvider>
    </DisplayShell>
  );
}
