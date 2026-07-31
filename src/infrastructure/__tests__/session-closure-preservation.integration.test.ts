import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { createSessionClosureFixture, cleanupSessionClosureFixture, SessionClosureFixture } from './supabase/session-closure.helpers';

const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

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
    // 1. Host encerra via RPC (simulando a close_session_action que chama o banco)
    await client.query(`select public.close_session($1) set user id = $2`, [fixture.sessionId, fixture.hostId]);

    // 2. Tentar adicionar na fila diretamente no SQL usando a role authenticated (RLS ativo) deve falhar
    // O RLS public.queue bloqueia insert se sessão não é ativa.
    const promise = client.query(`
      begin;
      select set_config('role', 'authenticated', true);
      select set_config('request.jwt.claims', format('{"sub": "%s"}', $2::text), true);
      insert into public.queue(session_id, participant_id, song_title, artist, status, position) 
      values ($1, $3, 'A', 'B', 'pending', 2);
      commit;
    `, [fixture.sessionId, fixture.participantUserId, fixture.participantId]);

    // Supabase RLS bloqueia silenciosamente e não insere (viola RLS e falha returning id ou viola constraint)
    // No caso do PostgreSQL nativo com RLS, ou dá erro ou apenas afeta 0 rows.
    await expect(promise).rejects.toThrow();
  });
});
