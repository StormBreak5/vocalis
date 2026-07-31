import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

describe.skipIf(process.env.RUN_SUPABASE_INTEGRATION !== 'true')('DB RPC: cancel_queue_entry', () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
  let sessionId: string;
  let hostToken: string;
  const p1: { id: string; token: string; queueId: string } = { id: '', token: '', queueId: '' };

  beforeAll(async () => {
    // 1. Create a host user and session
    const hostEmail = `host_${Date.now()}@test.com`;
    const { data: hostAuth } = await supabase.auth.admin.createUser({
      email: hostEmail, password: 'password123', email_confirm: true,
    });
    const { data: hostLoginData } = await supabase.auth.signInWithPassword({ email: hostEmail, password: 'password123' });
    hostToken = hostLoginData.session!.access_token;
    
    const { data: sessionData } = await supabase.rpc('create_session', { p_host_id: hostAuth.user!.id });
    sessionId = sessionData.id;

    // 2. Create participant
    const email = `participant_${Date.now()}@test.com`;
    await supabase.auth.admin.createUser({ email, password: 'password123', email_confirm: true });
    const { data: loginData } = await supabase.auth.signInWithPassword({ email, password: 'password123' });
    p1.token = loginData.session!.access_token;
    const participantClient = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${p1.token}` } }
    });

    const { data: joinData } = await participantClient.rpc('join_session', { p_code: sessionData.code, p_display_name: 'Cantor 1' });
    p1.id = joinData.participant.id;

    // 3. Request a song
    const { data: queueData } = await participantClient.rpc('create_queue_entry', {
      p_session_id: sessionId, p_song_title: 'Test Song', p_artist: 'Test Artist'
    });
    p1.queueId = queueData.id;
  });

  afterAll(async () => {
    await supabase.from('sessions').delete().eq('id', sessionId);
  });

  it('allows the owner to cancel a pending song', async () => {
    const client = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${p1.token}` } }
    });

    const { error } = await client.rpc('cancel_queue_entry', { p_queue_id: p1.queueId });
    if (error) console.error('Cancel Error:', error);
    expect(error).toBeNull();

    const { data, error: selectError } = await supabase.from('queue').select('status').eq('id', p1.queueId).single();
    if (selectError) console.error('Select Error:', selectError);
    expect(selectError).toBeNull();
    expect(data!.status).toBe('cancelled');
  });

  it('rejects cancellation of an already active song', async () => {
    // We create another one and force its status to singing
    const client = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${p1.token}` } }
    });

    const { data: queueData } = await client.rpc('create_queue_entry', {
      p_session_id: sessionId, p_song_title: 'Another Song', p_artist: 'Artist'
    });

    const hostClient = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${hostToken}` } }
    });
    const { error: updateError } = await hostClient.from('queue').update({ status: 'singing' }).eq('id', queueData.id);
    if (updateError) console.error('Update Error:', updateError);

    const { error } = await client.rpc('cancel_queue_entry', { p_queue_id: queueData.id });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('INVALID_STATUS_TRANSITION');
  });
});
