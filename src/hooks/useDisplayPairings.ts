'use client';

import { useEffect, useState } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { PairedDisplaySummary } from '@/src/domain/display-pairing.types';
import type { Database } from '@/src/infrastructure/supabase/database.types';
import { createClient } from '@/src/infrastructure/supabase/client';

type DisplayPairingRow = Pick<
  Database['public']['Tables']['display_pairings']['Row'],
  'id' | 'paired_at' | 'revoked_at'
>;

function mapRow(row: DisplayPairingRow): PairedDisplaySummary {
  return { id: row.id, pairedAt: row.paired_at };
}

function sortByPairedAt(entries: PairedDisplaySummary[]): PairedDisplaySummary[] {
  return [...entries].sort((a, b) => a.pairedAt.localeCompare(b.pairedAt));
}

export function useDisplayPairings(
  sessionId: string,
  initialPairedDisplays: PairedDisplaySummary[],
) {
  const [pairedDisplays, setPairedDisplays] = useState(initialPairedDisplays);

  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    const subscribe = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      } else {
        await supabase.realtime.setAuth();
      }
      if (cancelled) return;

      channel = supabase
        .channel(`display_pairings:${sessionId}:${crypto.randomUUID()}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'display_pairings',
            filter: `session_id=eq.${sessionId}`,
          },
          (payload: RealtimePostgresChangesPayload<DisplayPairingRow>) => {
            if (payload.eventType === 'INSERT') {
              const paired = mapRow(payload.new);
              setPairedDisplays((current) => current.some(({ id }) => id === paired.id)
                ? current
                : sortByPairedAt([...current, paired]));
            } else if (payload.eventType === 'UPDATE') {
              const row = payload.new;
              if (row.revoked_at) {
                setPairedDisplays((current) => current.filter(({ id }) => id !== row.id));
              } else {
                const paired = mapRow(row);
                setPairedDisplays((current) => current.some(({ id }) => id === paired.id)
                  ? current.map((item) => (item.id === paired.id ? paired : item))
                  : sortByPairedAt([...current, paired]));
              }
            }
          },
        )
        .subscribe();
    };

    void subscribe();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return pairedDisplays;
}
