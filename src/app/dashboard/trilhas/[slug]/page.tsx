import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ClipboardCheck, Target } from '@/components/icons'
import { LearningActivity, LearningReview } from '@/components/learning/LearningActivity'
import { LearningHero, LearningMap, learningKindLabel } from '@/components/learning/LearningPresentation'
import { isLearningSlug, learningHref, learningPath, nextLearningStep } from '@/lib/learning/progress'
import { getLearningDetail } from '@/lib/learning/server'
import { getQuestionSession } from '@/lib/questions/server'

export const metadata = { title: 'Roteiro de estudo · OmniMind' }

export default async function LearningDetailPage({ params, searchParams }: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ etapa?: string | string[]; revisao?: string | string[] }>
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  if (!isLearningSlug(slug)) notFound()
  const session = await getQuestionSession()
  const detail = await getLearningDetail(session, slug)
  if (!detail) notFound()
  const { path, steps, enrollment, progress, canReview } = detail
  const next = nextLearningStep(steps, progress)
  const completed = progress.filter((entry) => entry.completed_at).length
  const selected = steps.find((step) => step.id === query.etapa)
  const selectedProgress = progress.find((entry) => entry.step_id === selected?.id)
  const challenge = steps.find((step) => step.kind === 'challenge')
  const reviewing = canReview && query.revisao === '1' && selected?.kind === 'challenge' ? selected : null
  const activity = enrollment && selected && selectedProgress
    ? { enrollment: enrollment.id, step: selected, progress: selectedProgress }
    : null

  if (reviewing || activity) {
    return (
      <>
        <nav aria-label="Você está em" className="lp-breadcrumb">
          <Link href={learningHref(slug)} prefetch={false}><ArrowLeft size={17} aria-hidden="true" /> {path.title}</Link>
          <span className="lp-muted">{reviewing ? 'Avaliação manual' : selected?.title}</span>
        </nav>
        {reviewing ? <LearningReview session={session} path={path} step={reviewing} /> : (
          activity && <LearningActivity session={session} path={path} {...activity} next={next} />
        )}
      </>
    )
  }

  return (
    <>
      <nav aria-label="Você está em" className="lp-breadcrumb">
        <Link href={learningPath} prefetch={false}><ArrowLeft size={17} aria-hidden="true" /> Trilhas de estudo</Link>
      </nav>
      <LearningHero path={path} enrolled={!!enrollment} completed={completed} total={steps.length} next={next} />
      {query.etapa && <p role="status" className="lp-assessment-note">Abra a etapa pelo roteiro quando ela estiver disponível.</p>}
      <div className="lp-detail-grid">
        <LearningMap path={path} steps={steps} progress={progress} next={next} enrolled={!!enrollment} />
        <aside className="lp-rail" aria-label="Resumo do percurso">
          {next && <section className="lp-panel lp-next-panel">
            <Target size={23} aria-hidden="true" />
            <p className="lp-kicker">Próxima etapa</p>
            <h2>{next.title}</h2><p className="lp-muted">{learningKindLabel[next.kind]}</p>
          </section>}
          {canReview && challenge && <section className="lp-panel lp-next-panel">
            <ClipboardCheck size={23} aria-hidden="true" /><h2>Revisão de desafios</h2>
            <Link href={learningHref(slug, challenge.id, true)} prefetch={false} className="lp-button">Avaliar entregas</Link>
          </section>}
        </aside>
      </div>
    </>
  )
}
