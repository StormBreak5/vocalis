import { NextResponse, type NextRequest } from 'next/server';
import { isPrefetchRequest, updateSupabaseSession } from '@/src/infrastructure/supabase/proxy';

export async function proxy(request: NextRequest) {
  if (isPrefetchRequest(request)) {
    return NextResponse.next({ request });
  }
  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    /*
     * Roda em todas as rotas, exceto:
     * - _next/static, _next/image (assets do build)
     * - favicon.ico, sw.js, manifest.webmanifest, robots.txt, sitemap.xml
     * - icons/ (ícones do PWA)
     * - monitoring (tunnel do Sentry)
     * - arquivos de imagem estáticos
     * Server Actions (POST na própria rota) continuam cobertos.
     */
    '/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|monitoring|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
