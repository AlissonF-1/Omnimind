import Link from 'next/link'
import { BookOpen, History } from '@/components/icons'
import { percentage } from '@/lib/questions/performance'
import type { QuestionStats } from '@/lib/questions/server'

export function QuestionStatsCards({ total, totalLabel, stats, practiced }: {
  total: number | null
  totalLabel: string
  stats: QuestionStats | null
  practiced?: number | null
}) {
  const ratio = stats ? percentage(stats.correct, stats.correct + stats.incorrect) : null

  return (
    <dl className="q-panel q-metrics">
      <div className="q-metric">
        <dt>{totalLabel}</dt>
        <dd>
          {practiced === undefined ? total ?? '—' : practiced ?? '—'}
          {practiced !== undefined && total !== null && <span className="q-small-value"> / {total}</span>}
          {typeof practiced === 'number' && total !== null && total > 0 && (
            <progress className="q-progress" value={practiced} max={total} aria-label="Questões praticadas no catálogo" />
          )}
        </dd>
      </div>
      <div className="q-metric"><dt>Acertos</dt><dd className="q-positive">{stats?.correct ?? '—'}</dd></div>
      <div className="q-metric"><dt>Erros</dt><dd className="q-negative">{stats?.incorrect ?? '—'}</dd></div>
      <div className="q-metric">
        <dt>Precisão</dt>
        <dd>{ratio === null ? <span className="q-small-value">Sem dados</span> : ratio + '%'}</dd>
      </div>
    </dl>
  )
}

export function QuestionEmptyState({ title, description, href, action, history = false }: {
  title: string
  description: string
  href?: string
  action?: string
  history?: boolean
}) {
  const Icon = history ? History : BookOpen
  return (
    <div className="q-panel q-empty">
      <Icon size={25} aria-hidden="true" />
      <h2 className="q-section-title">{title}</h2>
      <p className="q-subtitle">{description}</p>
      {href && action && <Link href={href} prefetch={false} className="q-button">{action}</Link>}
    </div>
  )
}
