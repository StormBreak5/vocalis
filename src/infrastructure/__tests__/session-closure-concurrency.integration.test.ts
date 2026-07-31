// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { createPostgresRaceHarness, setAuthenticatedUser, type RaceHarness } from './supabase/postgres-race-harness';
import { cleanupSessionClosureFixture, createSessionClosureFixture, type SessionClosureFixture } from './supabase/session-closure.helpers';

const enabled=Boolean(process.env.SUPABASE_TEST_DB_URL);
const suite=enabled?describe:describe.skip;

type WriterCase={name:string;user(f:SessionClosureFixture):string;prepare?(c:Client,f:SessionClosureFixture):Promise<void>;query(f:SessionClosureFixture):{text:string;values:unknown[]}};
const writers:WriterCase[]=[
  {name:'join',user:f=>f.externalUserId,query:f=>({text:'select public.join_session($1,$2)',values:[f.code,'Race Join']})},
  {name:'create_queue_entry',user:f=>f.participantUserId,prepare:async(c,f)=>{await c.query('delete from public.queue where session_id=$1',[f.sessionId])},query:f=>({text:'select * from public.create_queue_entry($1,$2,$3)',values:[f.sessionId,'Race Song','Race Artist']})},
  {name:'cancel_queue_entry',user:f=>f.participantUserId,query:f=>({text:'select public.cancel_queue_entry($1)',values:[f.queueId]})},
  {name:'update_session_status',user:f=>f.hostId,query:f=>({text:'select * from public.update_session_status($1,$2)',values:[f.sessionId,'paused']})},
  {name:'update_queue_status',user:f=>f.hostId,query:f=>({text:'select * from public.update_queue_status($1,$2)',values:[f.queueId,'preparing']})},
];

suite('deterministic Session closure races',()=>{
  let harness:RaceHarness;
  beforeAll(async()=>{harness=await createPostgresRaceHarness()},15_000);
  afterAll(async()=>{await harness.close()});

  for(const writer of writers){
    it(`close vence ${writer.name}`,async()=>{
      const fixture=await createSessionClosureFixture(harness.observer,`C${writer.name.length}A${Math.floor(Math.random()*90+10)}`);
      try{
        if(writer.prepare) await writer.prepare(harness.observer,fixture);
        await harness.txA.query('begin'); await setAuthenticatedUser(harness.txA,fixture.hostId);
        await harness.txB.query('begin'); await setAuthenticatedUser(harness.txB,writer.user(fixture));
        const aPid=(await harness.txA.query<{pid:number}>('select pg_backend_pid() pid')).rows[0].pid;
        const bPid=(await harness.txB.query<{pid:number}>('select pg_backend_pid() pid')).rows[0].pid;
        await harness.txA.query('select * from public.close_session($1)',[fixture.sessionId]);
        const pending=harness.txB.query(writer.query(fixture));
        await harness.waitUntilBlocked(bPid,aPid);
        await harness.txA.query('commit');
        await expect(pending).rejects.toThrow(/SESSION_CLOSED/);
        await harness.txB.query('rollback');
      }finally{await cleanupSessionClosureFixture(harness.observer,fixture)}
    },15_000);

    it(`${writer.name} confirma antes de close`,async()=>{
      const fixture=await createSessionClosureFixture(harness.observer,`W${writer.name.length}B${Math.floor(Math.random()*90+10)}`);
      try{
        if(writer.prepare) await writer.prepare(harness.observer,fixture);
        await harness.txA.query('begin'); await setAuthenticatedUser(harness.txA,writer.user(fixture));
        await harness.txB.query('begin'); await setAuthenticatedUser(harness.txB,fixture.hostId);
        const aPid=(await harness.txA.query<{pid:number}>('select pg_backend_pid() pid')).rows[0].pid;
        const bPid=(await harness.txB.query<{pid:number}>('select pg_backend_pid() pid')).rows[0].pid;
        await harness.txA.query(writer.query(fixture));
        const pendingClose=harness.txB.query('select * from public.close_session($1)',[fixture.sessionId]);
        await harness.waitUntilBlocked(bPid,aPid);
        await harness.txA.query('commit');
        const closed=await pendingClose;
        expect(closed.rows[0]).toMatchObject({status:'closed',changed:true});
        await harness.txB.query('commit');
      }finally{await cleanupSessionClosureFixture(harness.observer,fixture)}
    },15_000);
  }

  it('serializa close contra close e preserva closed_at',async()=>{
    const fixture=await createSessionClosureFixture(harness.observer,`CC${Math.floor(Math.random()*9000+1000)}`);
    try{
      await harness.txA.query('begin'); await setAuthenticatedUser(harness.txA,fixture.hostId);
      await harness.txB.query('begin'); await setAuthenticatedUser(harness.txB,fixture.hostId);
      const aPid=(await harness.txA.query<{pid:number}>('select pg_backend_pid() pid')).rows[0].pid;
      const bPid=(await harness.txB.query<{pid:number}>('select pg_backend_pid() pid')).rows[0].pid;
      const first=await harness.txA.query('select * from public.close_session($1)',[fixture.sessionId]);
      const pending=harness.txB.query('select * from public.close_session($1)',[fixture.sessionId]);
      await harness.waitUntilBlocked(bPid,aPid); await harness.txA.query('commit');
      const second=await pending; await harness.txB.query('commit');
      expect(first.rows[0].changed).toBe(true); expect(second.rows[0].changed).toBe(false);
      expect(second.rows[0].closed_at.toISOString()).toBe(first.rows[0].closed_at.toISOString());
    }finally{await cleanupSessionClosureFixture(harness.observer,fixture)}
  },15_000);
});
