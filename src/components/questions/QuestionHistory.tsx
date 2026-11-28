import Link from 'next/link'
import { ArrowLeft, ArrowRight, CircleCheck, CircleX, MistakesIcon } from '@/components/icons'
import { historyHref, practiceHref, questionsPath } from '@/lib/questions/practice'
import type { Competency, HistoryAttempt, QuestionStats } from '@/lib/questions/server'
import { QuestionEmptyState, QuestionStatsCards } from './QuestionOverview'
import QuestionPerformance, { type QuestionPerformanceData } from './QuestionPerformance'

const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

export default function QuestionHistory({ attempts, stats, performance, topics, topicSlug, errorsOnly, page, totalPages, count }: {
  attempts: HistoryAttempt[]
  stats: QuestionStats | null
  performance: QuestionPerformanceData | null
  topics: Competency[]
  topicSlug?: string
  errorsOnly: boolean
  page: number
  totalPages: number
  count: number
}) {
  const topicNames = new Map(topics.map((topic) => [topic.id, topic.name.replace(/^SQL\s*·\s*/, '')]))

  return (
    <div className="q-shell q-stack">
      <header>
        <Link href={questionsPath} prefetch={false} className="q-button q-back"><ArrowLeft size={16} aria-hidden="true" /> Questões</Link>
        <div className="q-history-title">
          <h1 className="q-title">Histórico de questões</h1>
          <p className="q-subtitle">Acompanhe seu desempenho e retome as questões que quer revisar.</p>
        </div>
      </header>

      <QuestionStatsCards total={stats ? stats.correct + stats.incorrect : null} totalLabel="Total de respostas" stats={stats} />
      <QuestionPerformance data={performance} topics={topics} />

      <section className="q-panel q-pad" aria-labelledby="q-attempts">
        <div className="q-row q-between">
          <h2 id="q-attempts" className="q-section-title">Tentativas</h2>
          <p className="q-muted text-sm">{count} {count === 1 ? 'resultado' : 'resultados'}</p>
        </div>
        <div className="q-row q-between mt-4">
          <nav aria-label="Filtrar histórico" className="q-row">
            <Link href={historyHref(false, 1, topicSlug)} prefetch={false} aria-current={!errorsOnly ? 'page' : undefined} className="q-button q-filter">Todas</Link>
            <Link href={historyHref(true, 1, topicSlug)} prefetch={false} aria-current={errorsOnly ? 'page' : undefined} className="q-button q-filter"><MistakesIcon size={16} /> Revisar erros</Link>
          </nav>
          {topics.length > 0 && (
            <form action={historyHref()} method="get" className="q-row">
              {errorsOnly && <input type="hidden" name="filtro" value="erros" />}
              <select className="q-select" name="assunto" defaultValue={topicSlug ?? ''} aria-label="Competência">
                <option value="">Todas as competências</option>
                {topics.map((topic) => <option key={topic.id} value={topic.slug}>{topicNames.get(topic.id)}</option>)}
              </select>
              <button type="submit" className="q-button">Filtrar</button>
            </form>
          )}
        </div>

        {attempts.length === 0 ? (
          <div className="mt-4">
            <QuestionEmptyState
              history title={errorsOnly ? 'Nenhum erro para revisar' : 'Nenhuma resposta registrada'}
              description={errorsOnly ? 'As respostas incorretas deste filtro aparecerão aqui.' : 'Resolva uma questão para começar seu histórico.'}
              href={errorsOnly ? historyHref(false, 1, topicSlug) : practiceHref(topicSlug)}
              action={errorsOnly ? 'Ver todas as respostas' : 'Iniciar resolução'}
            />
          </div>
        ) : (
          <ul aria-label="Tentativas de resolução" className="q-history-list">
            {attempts.map((attempt) => {
              const Status = attempt.is_correct ? CircleCheck : CircleX
              return (
                <li key={attempt.id} className="q-history-item">
                  <div className="min-w-0">
                    <div className="q-row q-muted text-xs">
                      <span className={attempt.is_correct ? 'q-pill q-positive' : 'q-pill q-negative'}>
                        <Status size={14} aria-hidden="true" />{attempt.is_correct ? 'Acertou' : 'Errou'}
                      </span>
                      {attempt.question && <span>{topicNames.get(attempt.question.competency_id)}</span>}
                      <time dateTime={attempt.answered_at}>{dateFormat.format(new Date(attempt.answered_at))}</time>
                    </div>
                    <p className="line-clamp-2 mt-2 text-sm font-medium">{attempt.question?.statement ?? 'Questão respondida'}</p>
                  </div>
                  <Link href={practiceHref(topicSlug, attempt.question_version_id, errorsOnly ? 'erros' : 'historico')} prefetch={false} className="q-button">
                    Resolver novamente <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
        {totalPages > 1 && (
          <nav aria-label="Páginas do histórico" className="q-row q-between mt-4">
            <span className="q-muted text-xs">Página {page} de {totalPages}</span>
            <div className="q-row">
              {page > 1 && <Link href={historyHref(errorsOnly, page - 1, topicSlug)} prefetch={false} className="q-button">Anterior</Link>}
              {page < totalPages && <Link href={historyHref(errorsOnly, page + 1, topicSlug)} prefetch={false} className="q-button">Próxima</Link>}
            </div>
          </nav>
        )}
      </section>
    </div>
  )
}
