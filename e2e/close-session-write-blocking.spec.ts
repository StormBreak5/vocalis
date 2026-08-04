import { test, expect } from '@playwright/test';
import {
  closedDialogHeading,
  confirmSessionClosure,
  createContextSupabaseClient,
  createSession,
  joinSession,
  requestSong,
} from './helpers/session';

test.describe('US4: bloqueio de escritas após closed', () => {
  test('recusa todos os writers e preserva a fila no servidor', async ({
    browser,
  }) => {
    const hostContext = await browser.newContext();
    const participantContext = await browser.newContext();

    try {
      const hostPage = await hostContext.newPage();
      const participantPage = await participantContext.newPage();
      const code = await createSession(hostPage);

      await joinSession(participantPage, code, 'Cantor Bloqueado');
      await requestSong(participantPage, 'Música Preservada', 'Artista Preservado');

      const hostClient = await createContextSupabaseClient(hostContext);
      const participantClient =
        await createContextSupabaseClient(participantContext);

      const { data: sessionRow, error: sessionError } = await hostClient
        .from('sessions')
        .select('id')
        .eq('code', code)
        .single();
      expect(sessionError).toBeNull();
      expect(sessionRow).not.toBeNull();

      const sessionId = sessionRow?.id;
      if (!sessionId) throw new Error('Session não encontrada no E2E.');

      const { data: queueBefore, error: queueBeforeError } = await hostClient
        .from('queue')
        .select('id, song_title, artist, status, position, updated_at')
        .eq('session_id', sessionId)
        .single();
      expect(queueBeforeError).toBeNull();
      expect(queueBefore).not.toBeNull();

      await confirmSessionClosure(hostPage);
      await expect(closedDialogHeading(hostPage)).toBeVisible();
      await expect(closedDialogHeading(participantPage)).toBeVisible();

      await expect(
        participantPage.getByRole('button', {
          name: /Colocar na fila/i,
          includeHidden: true,
        }),
      ).toBeDisabled();

      const queueId = queueBefore?.id;
      if (!queueId) throw new Error('Queue entry não encontrada no E2E.');

      const [joinAttempt, createAttempt, cancelAttempt, queueAttempt, sessionAttempt] =
        await Promise.all([
          participantClient.rpc('join_session', {
            p_code: code,
            p_display_name: 'Cantor Bloqueado',
          }),
          participantClient.rpc('create_queue_entry', {
            p_session_id: sessionId,
            p_song_title: 'Pedido tardio',
            p_artist: 'Não deve persistir',
          }),
          participantClient.rpc('cancel_queue_entry', {
            p_queue_id: queueId,
          }),
          hostClient.rpc('update_queue_status', {
            p_queue_id: queueId,
            p_new_status: 'cancelled',
          }),
          hostClient.rpc('update_session_status', {
            p_session_id: sessionId,
            p_new_status: 'paused',
          }),
        ]);

      for (const attempt of [
        joinAttempt,
        createAttempt,
        cancelAttempt,
        queueAttempt,
        sessionAttempt,
      ]) {
        expect(attempt.error?.message).toContain('SESSION_CLOSED');
      }

      const { data: queueAfter, error: queueAfterError } = await hostClient
        .from('queue')
        .select('id, song_title, artist, status, position, updated_at')
        .eq('id', queueId)
        .single();

      expect(queueAfterError).toBeNull();
      expect(queueAfter).toEqual(queueBefore);

      const { count: lateRequestCount, error: lateRequestError } = await hostClient
        .from('queue')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .eq('song_title', 'Pedido tardio');

      expect(lateRequestError).toBeNull();
      expect(lateRequestCount).toBe(0);
    } finally {
      await hostContext.close();
      await participantContext.close();
    }
  });
});