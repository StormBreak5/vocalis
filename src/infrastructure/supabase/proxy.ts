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
 * Segue o padrão canônico do `@supabase/ssr` para Next.js: cria a resposta,
 * chama `getUser()` (que dispara o refresh + o `setAll`), e devolve a resposta
 * sem mexer em mais nada.
 *
 * NÃO chama `signInAnonymously()` — criar identidade continua exclusivo das
 * Server Actions (`create_session`, `join_session`, `redeem_display_pairing_code`).
 */
export async function updateSupabaseSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

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
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  await supabase.auth.getUser();

  return supabaseResponse;
}

/**
 * Requisições de prefetch do App Router: o Next dispara várias por página só
 * para aquecer o cache do roteador. Não precisam (nem devem) renovar sessão —
 * pular reduz drasticamente o número de chamadas ao Auth do Supabase.
 */
export function isPrefetchRequest(request: NextRequest): boolean {
  return (
    request.headers.get('next-router-prefetch') === '1' ||
    request.headers.get('purpose') === 'prefetch' ||
    request.headers.get('x-middleware-prefetch') === '1'
  );
}
