import { Activity, ChartNoAxesColumnIncreasing } from 'lucide-react'
import { percentage, type summarizeRecentAttempts } from '@/lib/questions/performance'
import type { Competency } from '@/lib/questions/server'

export type QuestionPerformanceData = ReturnType<typeof summarizeRecentAttempts>

function shortDay(day: string) {
  const [, month, date] = day.split('-')
  return date + '/' + month
}

function resultLabel(correct: number, incorrect: number) {
  return correct + (correct === 1 ? ' acerto' : ' acertos') + ' · '
    + incorrect + (incorrect === 1 ? ' erro' : ' erros')
}

export default function QuestionPerformance({ data, topics }: { data: QuestionPerformanceData | null; topics: Competency[] }) {
  if (!data || data.correct + data.incorrect === 0) {
    return (
      <section className="q-panel q-pad" aria-labelledby="q-performance">
        <h2 id="q-performance" className="q-section-title">Desempenho</h2>
        <p className="q-subtitle">{data ? 'Nenhuma tentativa registrada nos últimos 14 dias.' : 'Os dados de desempenho não estão disponíveis agora.'}</p>
      </section>
    )
  }

  const scores = new Map(data.competencies.map((row) => [row.id, row]))
  const peak = Math.max(1, ...data.days.map((day) => day.correct + day.incorrect))

  return (
    <div className="q-chart-grid">
      <section className="q-panel q-pad" aria-labelledby="q-performance">
        <div className="q-row q-between">
          <h2 id="q-performance" className="q-section-title">Por competência</h2>
          <ChartNoAxesColumnIncreasing size={21} className="q-muted" aria-hidden="true" />
        </div>
        <p className="q-subtitle">Acertos e erros nos últimos 14 dias.</p>
        <ul className="q-chart-list">
          {topics.map((topic) => {
            const row = scores.get(topic.id)
            const accuracy = row ? percentage(row.correct, row.correct + row.incorrect) : null
            return (
              <li key={topic.id}>
                <div className="q-row q-between">
                  <p className="font-semibold">{topic.name.replace(/^SQL\s*·\s*/, '')}</p>
                  <p className="q-muted">{row ? resultLabel(row.correct, row.incorrect) : 'Sem tentativas'}</p>
                </div>
                {accuracy !== null && (
                  <div className="q-stacked-track" aria-hidden="true">
                    <span className="q-chart-good" style={{ width: accuracy + '%' }} />
                    <span className="q-chart-bad" style={{ width: 100 - accuracy + '%' }} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>
      <section className="q-panel q-pad" aria-labelledby="q-activity">
        <div className="q-row q-between">
          <h2 id="q-activity" className="q-section-title">Atividade diária</h2>
          <Activity size={21} className="q-muted" aria-hidden="true" />
        </div>
        <p className="q-subtitle">
          {data.correct + data.incorrect} {data.correct + data.incorrect === 1 ? 'tentativa' : 'tentativas'} · {percentage(data.correct, data.correct + data.incorrect)}% de acerto
        </p>
        <div className="q-days" aria-hidden="true">
          {data.days.map((day) => (
            <div className="q-day" key={day.day} title={shortDay(day.day) + ' · ' + resultLabel(day.correct, day.incorrect)}>
              {day.correct + day.incorrect > 0 && <div className="q-day-value">{day.correct + day.incorrect}</div>}
              {day.incorrect > 0 && <span className="q-chart-bad" style={{ height: day.incorrect * 85 / peak + '%' }} />}
              {day.correct > 0 && <span className="q-chart-good" style={{ height: day.correct * 85 / peak + '%' }} />}
            </div>
          ))}
        </div>
        <div className="q-chart-dates" aria-hidden="true">
          <span>{shortDay(data.days[0].day)}</span><span>{shortDay(data.days[data.days.length - 1].day)}</span>
        </div>
        <details className="mt-4 text-xs">
          <summary className="q-muted w-fit cursor-pointer">Ver valores por dia</summary>
          <ul className="q-chart-list">
            {data.days.map((day) => <li key={day.day}>{shortDay(day.day)} · {resultLabel(day.correct, day.incorrect)}</li>)}
          </ul>
        </details>
      </section>
    </div>
  )
}
