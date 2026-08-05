import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { createSessionClosureFixture, cleanupSessionClosureFixture, SessionClosureFixture } from './supabase/session-closure.helpers';
import { setAuthenticatedUser } from './supabase/postgres-race-harness';

if (process.env.RUN_SUPABASE_INTEGRATION !== 'true') {
  throw new Error('Integração Supabase requer RUN_SUPABASE_INTEGRATION=true.');
}
if (!process.env.SUPABASE_TEST_DB_URL) {
  throw new Error('Integração Supabase requer SUPABASE_TEST_DB_URL local.');
}

const DB_URL = process.env.SUPABASE_TEST_DB_URL;

describe('Preservação de estado e bloqueio pós-fechamento (US4)', () => {
  let client: Client;
  let fixture: SessionClosureFixture;

  beforeAll(async () => {
    client = new Client({ connectionString: DB_URL });
    await client.connect();
    fixture = await createSessionClosureFixture(client, 'pres-us4');
  });

  afterAll(async () => {
    await cleanupSessionClosureFixture(client, fixture);
    await client.end();
  });

  it('não deve permitir adicionar na fila após a sessão estar fechada', async () => {
    await client.query('begin');
    try {
      await setAuthenticatedUser(client, fixture.hostId);
      await client.query('select * from public.close_session($1)', [fixture.sessionId]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }

    await client.query('begin');
    try {
      await setAuthenticatedUser(client, fixture.participantUserId);
      const insert = client.query(
        `insert into public.queue(session_id, participant_id, song_title, artist, status, position)
         values ($1, $2, 'A', 'B', 'pending', 2)`,
        [fixture.sessionId, fixture.participantId],
      );
      await expect(insert).rejects.toThrow();
    } finally {
      await client.query('rollback');
    }
  });
});
