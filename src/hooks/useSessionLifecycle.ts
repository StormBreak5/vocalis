/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useReducer } from 'react';
import { createClient } from '@/src/infrastructure/supabase/client';
import { 
  initialSessionLifecycleState, 
  sessionLifecycleReducer, 
} from './session-lifecycle.reducer';
import { getSessionStatus } from '@/src/application/session/get-session-status';
import type { 
  SessionStatusSnapshot, 
  SessionRealtimeEnvelope 
} from '@/src/domain/session.types';

export function useSessionLifecycle(sessionId: string, initialSnapshot: SessionStatusSnapshot) {
  const seeded = sessionLifecycleReducer(initialSessionLifecycleState, { type: 'snapshot', snapshot: initialSnapshot });
  const [state, dispatch] = useReducer(sessionLifecycleReducer, seeded);

  // Sincronizar re-renders do Next.js Server Components que tragam um snapshot mais atualizado
  useEffect(() => {
    if (initialSnapshot.status === 'closed' && state.phase !== 'closed') {
      dispatch({ type: 'SESSION_UPDATED', snapshot: initialSnapshot });
    }
  }, [initialSnapshot, state.phase]);

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    // Função de Resync (US3)
    const resync = async () => {
      if (state.phase === 'closed') return; // Não há necessidade de buscar se já sabemos que fechou
      try {
        const result = await getSessionStatus(sessionId);
        if (!isMounted) return;
        if (result.ok && result.snapshot) {
          dispatch({ type: 'SESSION_UPDATED', snapshot: result.snapshot });
        }
      } catch (e) {
        console.error('[Resync Error]', e);
      }
    };
    
    // Assinatura Realtime para interceptar mudanças na sessão atual
    const channel = supabase.channel(`session-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload: any) => {
          console.log('[Realtime] Payload recebido:', JSON.stringify(payload));
          const envelope = payload as SessionRealtimeEnvelope;
          if (envelope.new && envelope.new.id === sessionId && envelope.new.status) {
            console.log('[Realtime] Despachando SESSION_UPDATED para', envelope.new.status);
            dispatch({
              type: 'SESSION_UPDATED',
              snapshot: {
                id: envelope.new.id,
                code: envelope.new.code,
                status: envelope.new.status,
                closedAt: envelope.new.closed_at,
              },
            });
          }
        }
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          // Fecha a janela entre o carregamento inicial e a assinatura do canal.
          // Se um UPDATE ocorreu antes de SUBSCRIBED, esta leitura recupera o estado atual.
          resync();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          dispatch({ type: 'reconnecting' });
          resync();
        }
      });

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') resync();
    };

    const handleOnline = () => {
      resync();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);

    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      supabase.removeChannel(channel);
    };
  }, [sessionId, state.phase]); // dependências ok

  return { state, dispatch };
}
