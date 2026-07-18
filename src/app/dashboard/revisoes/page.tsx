import { getDueFlashcards, getUltimatumCards } from '@/actions/reviews'
import { getWorkspaceById } from '@/actions/workspaces'
import ReviewPanel from '@/components/ReviewPanel'
import WorkspaceSelector from '@/components/WorkspaceSelector'
import Link from 'next/link'
import { Suspense } from 'react'
import { ArrowLeft, Layers, Loader2, FileText, Zap } from 'lucide-react'

export const dynamic = 'force-dynamic'

function ReviewsLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <Loader2 className="size-8 animate-spin text-primary" />
      <p className="mt-4 text-sm text-text-muted">Carregando cards para revisão...</p>
    </div>
  )
}

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string; noteId?: string; mode?: string }>
}) {
  const params = await searchParams
  const workspaceId = params.workspaceId
  const noteId = params.noteId
  const mode = params.mode

  const isUltimatum = mode === 'ultimato'

  // Se não tem workspace, nota e não é modo Ultimato, mostra o seletor padrão
  if (!workspaceId && !noteId && !isUltimatum) {
    return (
      <div className="relative w-full min-h-[60vh] flex flex-col items-center justify-center py-8 sm:py-12 overflow-hidden rounded-3xl border border-border/40 bg-surface/30">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(#3b82f6_1px,transparent_1px)] dark:bg-[radial-gradient(#60a5fa_1px,transparent_1px)] bg-[size:24px_24px] opacity-[0.04]" />

        <div className="text-center max-w-2xl mx-auto px-4 z-10 flex flex-col items-center">
          <div className="mb-6 flex size-24 items-center justify-center rounded-[2rem] bg-black/40 ring-1 ring-primary/20 backdrop-blur-sm shadow-[0_0_40px_rgba(99,102,241,0.2)] overflow-hidden">
            <img src="/images/review_target_3d.jpg" alt="Foco de Revisão" className="w-full h-full object-cover" />
          </div>
          
          <h1 className="text-2xl sm:text-3xl font-bold text-text-strong mb-3 tracking-tight">
            Selecione um Foco de Revisão
          </h1>
          <p className="text-sm text-text-medium mb-8 max-w-md mx-auto tracking-wide leading-relaxed">
            Escolha o foco da sua sessão de estudo e revise seus flashcards baseados na curva de esquecimento.
          </p>
          <WorkspaceSelector />
        </div>
      </div>
    )
  }

  // Busca os cards pendentes e dados do workspace em paralelo
  const cardsPromise = isUltimatum
    ? getUltimatumCards({ workspaceId })
    : getDueFlashcards({ workspaceId, noteId })

  const [cards, workspace] = await Promise.all([
    cardsPromise,
    workspaceId ? getWorkspaceById(workspaceId).catch(() => null) : Promise.resolve(null)
  ])
  const cardCount = cards.length

  const pageTitle = isUltimatum 
    ? 'Modo Ultimato ⚡' 
    : (noteId ? 'Revisão Focada' : workspace?.name || 'Revisão')
    
  const pageSubtitle = isUltimatum 
    ? 'Força bruta de véspera (Cards dos próximos 15 dias ordenados por menor estabilidade)' 
    : (noteId ? 'Filtrado por anotação específica' : 'Revisão ativa baseada na curva de esquecimento (FSRS)')

  return (
    <div className="page-container max-w-4xl px-4 sm:px-6 py-4 sm:py-6">
      <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className={`page-title text-2xl sm:text-3xl truncate font-black ${isUltimatum ? 'text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.25)]' : ''}`}>
              {pageTitle}
            </h1>
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
              isUltimatum 
                ? 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]'
                : 'bg-primary-soft/30 text-primary border-primary/20'
            }`}>
              {isUltimatum ? <Zap className="size-3 text-red-400" /> : <Layers className="size-3" />}
              {cardCount} card{cardCount !== 1 ? 's' : ''} {isUltimatum ? 'remanescentes' : 'pendentes'}
            </span>
          </div>
          <p className="page-subtitle text-xs sm:text-sm text-text-muted mt-1 flex items-center gap-1">
            {noteId ? <FileText className="size-3" /> : null}
            {pageSubtitle}
          </p>
        </div>

        <Link
          href={noteId && workspaceId ? `/dashboard/${workspaceId}/note/${noteId}` : "/dashboard"}
          className="btn-secondary text-sm px-4 py-2 inline-flex items-center gap-2 w-full sm:w-auto justify-center"
        >
          <ArrowLeft className="size-4" />
          Voltar ao Dashboard
        </Link>
      </header>

      <Suspense fallback={<ReviewsLoading />}>
        <ReviewPanel initialCards={cards} mode={isUltimatum ? 'ultimato' : 'default'} />
      </Suspense>

    </div>
  )
}