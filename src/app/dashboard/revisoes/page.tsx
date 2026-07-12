import { getDueFlashcards } from '@/actions/reviews'
import { getWorkspaceById } from '@/actions/workspaces'
import ReviewPanel from '@/components/ReviewPanel'
import WorkspaceSelector from '@/components/WorkspaceSelector'
import Link from 'next/link'
import { Suspense } from 'react'
import { ArrowLeft, Layers, Calendar, Loader2, FileText, Target } from 'lucide-react'

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
  searchParams: Promise<{ workspaceId?: string; noteId?: string }>
}) {
  const params = await searchParams
  const workspaceId = params.workspaceId
  const noteId = params.noteId

  // Se não tem nem workspace e nem nota, mostra o seletor padrão
  if (!workspaceId && !noteId) {
    return (
      <div className="relative w-full min-h-[60vh] flex flex-col items-center justify-center py-8 sm:py-12 overflow-hidden rounded-3xl border border-border/40 bg-surface/30">
        {/* Fundo de Grid Radial de Alta Fidelidade */}
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(#3b82f6_1px,transparent_1px)] dark:bg-[radial-gradient(#60a5fa_1px,transparent_1px)] bg-[size:24px_24px] opacity-[0.04]" />

        <div className="text-center max-w-2xl mx-auto px-4 z-10 flex flex-col items-center">
          {/* Embalagem Central do Ícone Target (Vidro + Brilho) */}
          <div className="mb-6 flex size-16 items-center justify-center rounded-3xl bg-primary/10 ring-1 ring-primary/20 backdrop-blur-sm shadow-[0_0_30px_rgba(99,102,241,0.15)]">
            <Target className="size-8 text-primary" />
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
  const [cards, workspace] = await Promise.all([
    getDueFlashcards({ workspaceId, noteId }),
    workspaceId ? getWorkspaceById(workspaceId).catch(() => null) : Promise.resolve(null)
  ])
  const cardCount = cards.length

  return (
    <div className="page-container max-w-4xl px-4 sm:px-6 py-4 sm:py-6">
      <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="page-title text-2xl sm:text-3xl truncate">
              {noteId ? 'Revisão Focada' : workspace?.name || 'Revisão'}
            </h1>
            <span className="inline-flex items-center gap-1 text-xs font-medium bg-primary-soft/30 text-primary px-2.5 py-0.5 rounded-full border border-primary/20">
              <Layers className="size-3" />
              {cardCount} card{cardCount !== 1 ? 's' : ''} pendente{cardCount !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="page-subtitle text-sm text-text-muted mt-1 flex items-center gap-1">
            {noteId ? <FileText className="size-3" /> : null}
            {noteId ? 'Filtrado por anotação específica' : 'Revisão ativa baseada na curva de esquecimento (FSRS)'}
          </p>
        </div>

        <Link
          href={noteId && workspaceId ? `/dashboard/${workspaceId}/note/${noteId}` : "/dashboard/revisoes"}
          className="btn-secondary text-sm px-4 py-2 inline-flex items-center gap-2 w-full sm:w-auto justify-center"
        >
          <ArrowLeft className="size-4" />
          {noteId ? 'Voltar para Anotação' : 'Trocar workspace'}
        </Link>
      </header>

      <Suspense fallback={<ReviewsLoading />}>
        <ReviewPanel initialCards={cards} />
      </Suspense>

      {cardCount === 0 && (
        <div className="mt-6 panel-muted p-6 rounded-2xl text-center">
          <div className="flex flex-col items-center gap-2">
            <div className="inline-flex items-center justify-center size-12 rounded-full bg-surface-muted text-text-muted">
              <Calendar className="size-6" />
            </div>
            <p className="text-sm font-medium text-text-strong">
              Tudo em dia!
            </p>
            <p className="text-xs text-text-muted max-w-sm">
              Volte mais tarde ou crie novos flashcards para revisar.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}