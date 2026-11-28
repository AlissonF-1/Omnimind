import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import { ArrowLeft, ArrowRight, FileText, Layers3, Zap } from '@/components/icons'
import { getDueFlashcards, getUltimatumCards } from '@/actions/reviews'
import { getWorkspaceById } from '@/actions/workspaces'
import ReviewPanel from '@/components/ReviewPanel'
import WorkspaceSelector from '@/components/WorkspaceSelector'
import './reviews.css'

export const dynamic = 'force-dynamic'

type ReviewFilters = { workspaceId?: string; noteId?: string; mode?: string }

function ReviewsLoading() {
  return (
    <div className="rv-panel rv-loading" role="status">
      <Layers3 size={21} aria-hidden="true" />
      Carregando flashcards…
    </div>
  )
}

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<ReviewFilters> }) {
  const { workspaceId, noteId, mode } = await searchParams
  const isUltimatum = mode === 'ultimato'

  if (!workspaceId && !noteId && !isUltimatum) {
    return (
      <div className="reviews-area">
        <header className="rv-hero">
          <div className="rv-hero-art" aria-hidden="true">
            <Image src="/images/review_target_3d.jpg" fill alt="" sizes="(max-width: 640px) 70vw, 440px" preload />
          </div>
          <div className="rv-hero-copy">
            <h1>Revisão ativa</h1>
            <p>Escolha a matéria e revisite os flashcards que precisam de atenção hoje.</p>
            <a href="#fila-revisao" className="rv-button rv-primary">Escolher workspace <ArrowRight size={16} aria-hidden="true" /></a>
          </div>
        </header>

        <div id="fila-revisao" className="rv-queue-anchor" tabIndex={-1}>
          <Suspense fallback={<ReviewsLoading />}>
            <WorkspaceSelector />
          </Suspense>
        </div>

        <aside className="rv-panel rv-ultimatum">
          <span className="rv-icon rv-orange"><Zap size={21} aria-hidden="true" /></span>
          <div>
            <h2>Modo Ultimato</h2>
            <p>Revise em formato de quiz os cards dos próximos 15 dias, começando pelos menos estáveis.</p>
          </div>
          <Link href="/dashboard/revisoes?mode=ultimato" className="rv-button">Abrir Ultimato <ArrowRight size={15} aria-hidden="true" /></Link>
        </aside>
      </div>
    )
  }

  return (
    <div className="reviews-area rv-session">
      <Suspense fallback={<ReviewsLoading />}>
        <ReviewSession workspaceId={workspaceId} noteId={noteId} isUltimatum={isUltimatum} />
      </Suspense>
    </div>
  )
}

async function ReviewSession({ workspaceId, noteId, isUltimatum }: Omit<ReviewFilters, 'mode'> & { isUltimatum: boolean }) {
  const [cards, workspace] = await Promise.all([
    (isUltimatum ? getUltimatumCards({ workspaceId }) : getDueFlashcards({ workspaceId, noteId })).catch(() => null),
    workspaceId ? getWorkspaceById(workspaceId).catch(() => null) : Promise.resolve(null),
  ])

  const title = isUltimatum ? 'Modo Ultimato' : noteId ? 'Revisão da nota' : workspace?.name || 'Sessão de revisão'
  const Icon = isUltimatum ? Zap : noteId ? FileText : Layers3
  const contextLink = noteId && workspaceId
    ? { href: '/dashboard/' + workspaceId + '/note/' + noteId, label: 'Voltar à nota' }
    : { href: '/dashboard', label: 'Painel' }

  return (
    <>
      <header className="rv-panel rv-session-header" data-ultimatum={isUltimatum}>
        <div className="rv-heading">
          <span className={'rv-icon ' + (isUltimatum ? 'rv-orange' : '')}><Icon size={23} aria-hidden="true" /></span>
          <div className="min-w-0">
            <h1>{title}</h1>
            <p>{isUltimatum ? 'Cards dos próximos 15 dias, por menor estabilidade.' : 'Revisão ativa com repetição espaçada (FSRS).'}</p>
          </div>
        </div>
        <nav className="rv-row" aria-label="Navegação da revisão">
          <Link href="/dashboard/revisoes" className="rv-button"><ArrowLeft size={16} aria-hidden="true" /> Fila de revisão</Link>
          <Link href={contextLink.href} className="rv-button rv-quiet">{contextLink.label}</Link>
        </nav>
      </header>

      {cards === null ? (
        <div className="rv-panel rv-loading" role="alert">
          <span>Não foi possível carregar os flashcards.</span>
          <form method="get" action="/dashboard/revisoes">
            {workspaceId && <input type="hidden" name="workspaceId" value={workspaceId} />}
            {noteId && <input type="hidden" name="noteId" value={noteId} />}
            {isUltimatum && <input type="hidden" name="mode" value="ultimato" />}
            <button className="rv-button" type="submit">Tentar novamente</button>
          </form>
        </div>
      ) : (
        <ReviewPanel
          key={JSON.stringify([workspaceId, noteId, isUltimatum])}
          initialCards={cards}
          mode={isUltimatum ? 'ultimato' : 'default'}
          workspaceId={workspaceId}
          noteId={noteId}
        />
      )}
    </>
  )
}
