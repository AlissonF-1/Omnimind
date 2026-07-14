import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Exclui rotas que não precisam de autenticação:
     * - _next/static (arquivos estáticos do Next.js)
     * - _next/image (otimização de imagens)
     * - favicon.ico
     * - Arquivos PWA: sw.js, workbox-*.js, manifest.json
     * - Arquivos de imagem comuns
     */
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|sw\\.js\\.map|workbox-.*\\.js|workbox-.*\\.js\\.map|swe-worker-.*\\.js|manifest\\.json|icon-.*\\.png|logo\\.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
