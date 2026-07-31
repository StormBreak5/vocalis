import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

describe.skipIf(process.env.RUN_SUPABASE_INTEGRATION !== 'true')('DB RPC: create_queue_entry', () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
  let sessionId: string;
  const participantTokens: { id: string; email: string; token: string }[] = [];

  beforeAll(async () => {
    // 1. Create a host user
    const hostEmail = `host_${Date.now()}@test.com`;
    const { data: hostAuth, error: createHostError } = await supabase.auth.admin.createUser({
      email: hostEmail, password: 'password123', email_confirm: true,
    });
    if (createHostError) console.error('createHostError:', createHostError);
    const hostId = hostAuth.user!.id;

    // 2. Create session
    const { data: sessionData } = await supabase.rpc('create_session', { p_host_id: hostId });
    sessionId = sessionData.id;
    const sessionCode = sessionData.code;

    // 3. Create a couple of anonymous participants via API
    for (let i = 0; i < 2; i++) {
      const email = `participant_${i}_${Date.now()}@test.com`;
      await supabase.auth.admin.createUser({
        email,
        password: 'password123',
        email_confirm: true,
      });

      // Login to get token
      const { data: loginData } = await supabase.auth.signInWithPassword({
        email,
        password: 'password123',
      });

      const token = loginData.session!.access_token;
      
      // Join session using the participant's client
      const participantClient = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        global: { headers: { Authorization: `Bearer ${token}` } }
      });

      const { data: joinData, error: joinError } = await participantClient.rpc('join_session', {
        p_code: sessionCode,
        p_display_name: `Cantor ${i}`,
      });

      if (joinError || !joinData) {
        throw new Error(`Failed to join session: ${joinError?.message || 'Unknown error'}`);
      }

      participantTokens.push({ id: joinData.participant.id, email, token });
    }
  });

  afterAll(async () => {
    await supabase.from('sessions').delete().eq('id', sessionId);
  });

  it('allows a participant to request a song and auto-assigns position 1', async () => {
    const p1 = participantTokens[0];
    const client = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${p1.token}` } }
    });

    const { data, error } = await client.rpc('create_queue_entry', {
      p_session_id: sessionId,
      p_song_title: 'Evidências',
      p_artist: 'Chitãozinho & Xororó',
    });

    expect(error).toBeNull();
    expect(data.position).toBe(1);
    expect(data.status).toBe('pending');
    expect(data.participant_id).toBe(p1.id);
  });

  it('rejects if the participant tries to request another song while the first is pending', async () => {
    const p1 = participantTokens[0];
    const client = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${p1.token}` } }
    });

    const { error } = await client.rpc('create_queue_entry', {
      p_session_id: sessionId,
      p_song_title: 'Bohemian Rhapsody',
      p_artist: 'Queen',
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain('ACTIVE_SONG_EXISTS');
  });

  it('assigns position 2 to the second participant', async () => {
    const p2 = participantTokens[1];
    const client = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${p2.token}` } }
    });

    const { data, error } = await client.rpc('create_queue_entry', {
      p_session_id: sessionId,
      p_song_title: 'Wonderwall',
      p_artist: 'Oasis',
    });

    expect(error).toBeNull();
    expect(data.position).toBe(2);
  });
});
