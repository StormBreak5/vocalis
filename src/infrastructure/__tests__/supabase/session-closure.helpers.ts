import type { Client } from 'pg';

export type SessionClosureFixture = {
  hostId: string;
  otherHostId: string;
  participantUserId: string;
  externalUserId: string;
  sessionId: string;
  code: string;
  participantId: string;
  queueId: string;
};

export async function cleanupSessionClosureFixture(client: Client, fixture: SessionClosureFixture): Promise<void> {
  await client.query('delete from public.queue where session_id = $1', [fixture.sessionId]);
  await client.query('delete from public.participants where session_id = $1', [fixture.sessionId]);
  await client.query('delete from public.sessions where id = $1', [fixture.sessionId]);
  await client.query('delete from auth.users where id = any($1::uuid[])', [[fixture.hostId, fixture.otherHostId, fixture.participantUserId, fixture.externalUserId]]);
}

export async function createSessionClosureFixture(client: Client, suffix: string): Promise<SessionClosureFixture> {
  const ids = await client.query<{ host_id: string; other_host_id: string; participant_user_id: string; external_user_id: string }>(`select gen_random_uuid() host_id, gen_random_uuid() other_host_id, gen_random_uuid() participant_user_id, gen_random_uuid() external_user_id`);
  const value = ids.rows[0];
  await client.query(`insert into auth.users(id,aud,role,email,encrypted_password) values ($1,'authenticated','authenticated',$2,'x'),($3,'authenticated','authenticated',$4,'x'),($5,'authenticated','authenticated',$6,'x'),($7,'authenticated','authenticated',$8,'x')`, [value.host_id,`host-${suffix}@test.local`,value.other_host_id,`other-${suffix}@test.local`,value.participant_user_id,`member-${suffix}@test.local`,value.external_user_id,`external-${suffix}@test.local`]);
  const session = await client.query<{ id: string }>(`insert into public.sessions(code,host_id,status) values ($1,$2,'active') returning id`, [suffix.slice(0,6).toUpperCase().padEnd(6,'X'), value.host_id]);
  const participant = await client.query<{ id: string }>(`insert into public.participants(session_id,display_name,auth_user_id) values ($1,'Cantor',$2) returning id`, [session.rows[0].id, value.participant_user_id]);
  const queue = await client.query<{ id: string }>(`insert into public.queue(session_id,participant_id,song_title,artist,status,position) values ($1,$2,'Song','Artist','pending',1) returning id`, [session.rows[0].id, participant.rows[0].id]);
  return { hostId:value.host_id, otherHostId:value.other_host_id, participantUserId:value.participant_user_id, externalUserId:value.external_user_id, sessionId:session.rows[0].id, code:suffix.slice(0,6).toUpperCase().padEnd(6,'X'), participantId:participant.rows[0].id, queueId:queue.rows[0].id };
}
