import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Check, Layers, LockKeyhole, Play, Route, Send } from 'lucide-react'
import { beginLearningStepAction, enrollLearningAction } from '@/actions/learning'
import { learningHref, learningStepStatus, type LearningProgress } from '@/lib/learning/progress'
import type { LearningPath, LearningStep } from '@/lib/learning/server'
import { LearningActionForm } from './LearningForms'

const sqlSlug = 'sql-concursos-e-mercado'
const sqlCover = '/images/trilhas/sql.webp'
const typeNames = { concurso: 'Concursos', mercado: 'Mercado' }
const topicArt: Record<string, string> = {
  'select-where': '/images/questoes/select-where.webp',
  'and-or': '/images/questoes/and-or.webp',
  join: '/images/questoes/join.webp',
  'group-having': '/images/questoes/group-by.webp',
  'count-null': '/images/questoes/count-null.webp',
  challenge: '/images/dashboard/review-cards.webp',
  assessment: '/images/trilhas/sql.webp',
}

export const learningKindLabel = {
  reading: 'Leitura guiada',
  practice: 'Prática com questões',
  challenge: 'Entrega prática',
  assessment: 'Avaliação final',
}

function coverFor(path: LearningPath) {
  return path.slug === sqlSlug ? sqlCover : '/images/dashboard/brain.webp'
}

export function LearningMeter({ completed, total }: { completed: number; total: number }) {
  return (
    <div className="lp-meter">
      <div><span>{completed} de {total} etapas cumpridas</span><strong>{total ? Math.round(completed / total * 100) : 0}%</strong></div>
      <progress value={completed} max={Math.max(1, total)} aria-label={'Progresso da trilha, ' + completed + ' de ' + total + ' etapas cumpridas'} />
    </div>
  )
}

export function LearningHero({ path, total, completed, enrolled, next }: {
  path: LearningPath
  total: number
  completed: number
  enrolled: boolean
  next: LearningStep | null
}) {
  return (
    <header className="lp-hero">
      <Image src={coverFor(path)} fill alt="" className="lp-hero-art" sizes="(max-width: 767px) 100vw, 720px" preload />
      <div className="lp-hero-copy">
        <p className="lp-kicker"><Layers size={16} aria-hidden="true" /> {typeNames[path.kind]}</p>
        <h1>{path.title}</h1>
        <p className="lp-muted">{path.description}</p>
        <LearningMeter completed={completed} total={total} />
        <div className="lp-hero-cta">
          {enrolled && next ? (
            <LearningActionForm action={beginLearningStepAction.bind(null, path.slug, next.id)} label="Continuar aprendendo" primary />
          ) : !enrolled && total > 0 ? (
            <LearningActionForm action={enrollLearningAction.bind(null, path.slug, path.id)} label="Começar trilha" primary />
          ) : enrolled && total > 0 ? <span className="lp-flag lp-done"><Check size={16} aria-hidden="true" /> Trilha concluída</span> : null}
        </div>
      </div>
    </header>
  )
}

export function LearningPathCard({ path }: {
  path: LearningPath & { enrolled: boolean; completed: number; total: number; next: { id: string; title: string } | null }
}) {
  return (
    <article className="lp-catalog-card">
      <div className="lp-catalog-art">
        <Image src={coverFor(path)} fill sizes="(max-width: 767px) 100vw, 500px" alt="" />
        <span className="lp-flag">{typeNames[path.kind]}</span>
      </div>
      <div className="lp-card-inner">
        <div className="lp-card-copy">
          <h2>{path.title}</h2>
          <p className="lp-muted">{path.enrolled && path.next ? 'Próxima etapa · ' + path.next.title : path.description}</p>
        </div>
        <LearningMeter completed={path.completed} total={path.total} />
        {path.enrolled && path.next ? (
          <div className="lp-card-actions">
            <LearningActionForm action={beginLearningStepAction.bind(null, path.slug, path.next.id)} label="Continuar aprendendo" primary />
            <Link href={learningHref(path.slug)} prefetch={false} className="lp-step-link">Ver roteiro <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        ) : <Link href={learningHref(path.slug)} prefetch={false} className="lp-button lp-primary"><Play size={17} aria-hidden="true" /> Ver trilha <ArrowRight size={17} aria-hidden="true" /></Link>}
      </div>
    </article>
  )
}

export function LearningMap({ path, steps, progress, next, enrolled }: {
  path: LearningPath
  steps: LearningStep[]
  progress: LearningProgress[]
  next: LearningStep | null
  enrolled: boolean
}) {
  const saved = new Map(progress.map((entry) => [entry.step_id, entry]))
  const missions: LearningStep[][] = []
  for (const step of steps) {
    const mission = missions.at(-1)
    if (mission?.[0].topic === step.topic) mission.push(step)
    else missions.push([step])
  }

  return (
    <section aria-labelledby="lp-map-title" className="lp-map">
      <div className="lp-section-heading">
        <Route size={22} aria-hidden="true" />
        <div><h2 id="lp-map-title">Roteiro da trilha</h2><p className="lp-muted">{missions.length} missões · {steps.length} etapas</p></div>
      </div>
      {missions.length === 0 && <p className="lp-panel">As etapas desta trilha ainda serão publicadas.</p>}
      <ol className="lp-timeline">
        {missions.map((mission, index) => {
          const [first] = mission
          const done = mission.every((step) => saved.get(step.id)?.completed_at)
          const active = mission.some((step) => step.id === next?.id)
          const awaitingApproval = done && first.kind === 'challenge' && !saved.get(first.id)?.challenge_approved
          const state = awaitingApproval ? 'delivered' : done ? 'done' : active ? 'active' : 'locked'
          const NodeIcon = awaitingApproval ? Send : done ? Check : active ? Play : LockKeyhole
          return (
            <li key={first.id} className="lp-mission" data-topic={first.topic} data-state={state}>
              <span className="lp-node" aria-hidden="true"><NodeIcon size={13} /></span>
              <article className="lp-mission-card">
                <header className="lp-mission-heading">
                  <div className="lp-mission-art"><Image src={topicArt[first.topic] ?? coverFor(path)} fill sizes="100px" alt="" /></div>
                  <div><p className="lp-kicker">Missão {String(index + 1).padStart(2, '0')}</p><h3>{first.title}</h3></div>
                </header>
                <ul className="lp-mission-steps">
                  {mission.map((step) => {
                    const entry = saved.get(step.id)
                    const available = enrolled && (step.id === next?.id || !!entry)
                    const locked = !entry && step.id !== next?.id
                    const status = learningStepStatus(step.kind, entry)
                    const successful = !!entry?.completed_at && (step.kind !== 'challenge' || !!entry.challenge_approved)
                    return (
                      <li key={step.id}>
                        <div className="lp-step-name">{learningKindLabel[step.kind]}</div>
                        <span className={'lp-flag' + (successful ? ' lp-done' : entry || !locked ? ' lp-open' : '')}>
                          {locked ? <><LockKeyhole size={12} aria-hidden="true" /> Bloqueada</> : status}
                        </span>
                        {available && entry ? (
                          <Link href={learningHref(path.slug, step.id)} prefetch={false} className="lp-step-link">
                            {entry.completed_at ? 'Ver etapa' : 'Retomar'} <span className="sr-only">{step.title}</span><ArrowRight size={15} aria-hidden="true" />
                          </Link>
                        ) : available ? <LearningActionForm action={beginLearningStepAction.bind(null, path.slug, step.id)} label={'Abrir ' + learningKindLabel[step.kind].toLowerCase()} /> : null}
                      </li>
                    )
                  })}
                </ul>
              </article>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
