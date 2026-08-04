'use client';

import { useRef, useState } from 'react';
import { useSessionLifecycleContext } from '@/src/components/session/SessionLifecycleProvider';
import { Button } from '@/src/components/ui/button';
import { updateSessionStatusAction } from '@/src/application/session/update-session-status.action';
import { getSessionStatus } from '@/src/application/session/get-session-status';
import { toast } from 'sonner';
import { Pause, Play, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { SessionStatusSnapshot } from '@/src/domain/session.types';

const STATUS_CONFIRMATION_TIMEOUT_MS = 8_000;

type StatusUpdateAttempt =
  | { type: 'result'; result: Awaited<ReturnType<typeof updateSessionStatusAction>> }
  | { type: 'timeout' };

async function waitForStatusUpdate(
  sessionId: string,
  newStatus: 'active' | 'paused',
): Promise<StatusUpdateAttempt> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<StatusUpdateAttempt>((resolve) => {
    timeoutId = setTimeout(
      () => resolve({ type: 'timeout' }),
      STATUS_CONFIRMATION_TIMEOUT_MS,
    );
  });
  const action = updateSessionStatusAction(sessionId, newStatus).then(
    (result): StatusUpdateAttempt => ({ type: 'result', result }),
  );
  const outcome = await Promise.race([action, timeout]);
  if (timeoutId) clearTimeout(timeoutId);
  return outcome;
}

export function SessionStatusToggle() {
  const { sessionId, snapshot, phase, writesAllowed, dispatch } = useSessionLifecycleContext();
  const [isUpdating, setIsUpdating] = useState(false);
  const requestInFlightRef = useRef(false);
  const router = useRouter();

  const status = snapshot?.status;
  const isPaused = status === 'paused';
  const isClosed = status === 'closed';
  const isLoading = phase === 'loading' || !snapshot;
  const newStatus = isPaused ? 'active' : 'paused';
  const isDisabled = isUpdating || isLoading || isClosed || !writesAllowed;

  const applySnapshot = (nextSnapshot: SessionStatusSnapshot) => {
    dispatch({ type: 'SESSION_UPDATED', snapshot: nextSnapshot });
    toast.success(`Fila ${nextSnapshot.status === 'active' ? 'retomada' : 'pausada'} com sucesso.`);
    router.refresh();
  };

  const recoverStatus = async (requestedStatus: 'active' | 'paused') => {
    const recovered = await getSessionStatus(sessionId);
    if (!recovered.ok) return false;
    if (recovered.snapshot.status === requestedStatus) {
      applySnapshot(recovered.snapshot);
      return true;
    }
    dispatch({ type: 'SESSION_UPDATED', snapshot: recovered.snapshot });
    return false;
  };

  const handleToggle = async () => {
    if (isDisabled || requestInFlightRef.current || !snapshot) return;

    requestInFlightRef.current = true;
    setIsUpdating(true);
    try {
      const outcome = await waitForStatusUpdate(sessionId, newStatus);
      if (outcome.type === 'timeout') {
        if (await recoverStatus(newStatus)) return;
        toast.error('Não foi possível confirmar a alteração', {
          description: 'Verifique sua conexão e tente novamente.',
        });
        return;
      }

      const response = outcome.result;
      if (response.ok) {
        applySnapshot({
          id: response.result.id,
          code: snapshot.code,
          status: response.result.status,
          closedAt: null,
        });
        return;
      }

      if (response.code === 'RESPONSE_UNCERTAIN' && await recoverStatus(newStatus)) {
        return;
      }

      toast.error('Erro', { description: response.userMessage });
    } catch {
      if (await recoverStatus(newStatus)) return;
      toast.error('Erro inesperado', { description: 'Tente novamente.' });
    } finally {
      requestInFlightRef.current = false;
      setIsUpdating(false);
    }
  };

  const label = isPaused ? 'Retomar fila' : 'Pausar fila';

  return (
    <Button
      variant={isPaused ? 'default' : 'secondary'}
      onClick={() => void handleToggle()}
      disabled={isDisabled}
      aria-busy={isUpdating}
      className="w-full sm:w-auto min-h-[48px]"
    >
      {isUpdating || isLoading ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
      ) : isPaused ? (
        <Play className="w-4 h-4 mr-2" aria-hidden="true" />
      ) : (
        <Pause className="w-4 h-4 mr-2" aria-hidden="true" />
      )}
      {label}
    </Button>
  );
}
