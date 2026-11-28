import { Moon, Sparkles, Sun, Sunrise } from '@/components/icons'

type HourlyLog = {
  hourly_reviews?: number[] | null
  hourly_correct?: number[] | null
}

export default function StudyInsightsPanel({ logs, aiReport }: { logs: HourlyLog[]; aiReport: string }) {
  const periods = [
    { name: 'Manhã', range: '05h–12h', icon: Sunrise, total: 0, correct: 0 },
    { name: 'Tarde', range: '12h–18h', icon: Sun, total: 0, correct: 0 },
    { name: 'Noite', range: '18h–05h', icon: Moon, total: 0, correct: 0 },
  ]

  for (const log of logs) {
    for (let hour = 0; hour < 24; hour += 1) {
      const period = periods[hour >= 5 && hour < 12 ? 0 : hour >= 12 && hour < 18 ? 1 : 2]
      period.total += Number(log.hourly_reviews?.[hour] || 0)
      period.correct += Number(log.hourly_correct?.[hour] || 0)
    }
  }

  const paragraphs = aiReport.split('\n\n').map((paragraph) => paragraph.replace(/\*\*/g, '').trim()).filter(Boolean)

  return (
    <section aria-labelledby="dashboard-insights">
      <h2 id="dashboard-insights" className="dh-heading mb-3">Insights de estudo</h2>
      <div className="dh-insights-grid">
        <article className="dh-panel dh-pad">
          <h3 className="dh-title">Aproveitamento por horário</h3>
          <ul className="mt-3 list-none p-0">
            {periods.map(({ name, range, icon: Icon, total, correct }) => {
              const accuracy = total > 0 ? Math.round(correct * 100 / total) : null
              return (
                <li className="dh-quest" key={name}>
                  <div className="dh-row dh-between">
                    <span className="dh-row text-sm font-semibold">
                      <Icon className="dh-accent" size={16} aria-hidden="true" /> {name}
                      <span className="dh-caption !text-xs">{range}</span>
                    </span>
                    <span className="dh-caption !text-xs">
                      {accuracy === null ? 'Sem revisões' : total + (total === 1 ? ' revisão' : ' revisões') + ' · ' + accuracy + '% de acerto'}
                    </span>
                  </div>
                  {accuracy !== null && <progress className="dh-progress mt-2" value={accuracy} max={100} aria-label={'Taxa de acerto no período ' + name.toLowerCase()} />}
                </li>
              )
            })}
          </ul>
        </article>
        <article className="dh-panel dh-pad">
          <div className="dh-row">
            <Sparkles className="dh-accent" size={18} aria-hidden="true" />
            <h3 className="dh-title">Ciclo de aprendizado semanal</h3>
          </div>
          <div className="dh-caption mt-3 space-y-3 break-words">
            {paragraphs.length > 0 ? paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)
              : <p>O relatório aparece aqui conforme você registra revisões.</p>}
          </div>
        </article>
      </div>
    </section>
  )
}
