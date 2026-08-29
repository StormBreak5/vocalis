import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { Database } from './database.types';
import { env } from '../env';

/**
 * Renova a sessão anônima do Supabase antes de qualquer render.
 *
 * Server Components não conseguem escrever cookies (a exceção é engolida em
 * `src/infrastructure/supabase/server.ts`), então o refresh do access token
 * precisa acontecer aqui, no proxy, que roda uma vez por navegação e comita
 * o cookie renovado na resposta. Sem isto, uma sessão longa (DJ operando por
 * horas) perde o token no meio e o RLS passa a negar as leituras SSR,
 * derrubando o painel.
 *
 * NÃO chama `signInAnonymously()` — criar identidade continua exclusivo das
 * Server Actions (`create_session`, `join_session`, `redeem_display_pairing_code`).
 */
export async function updateSupabaseSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // Dispara o refresh do token (e a escrita do cookie via setAll acima).
  await supabase.auth.getUser();

  // Respostas que carregam cookie de auth nunca podem ser cacheadas por
  // CDN/proxy (recomendação do @supabase/ssr).
  response.headers.set(
    'Cache-Control',
    'private, no-cache, no-store, max-age=0, must-revalidate',
  );

  return response;
}
