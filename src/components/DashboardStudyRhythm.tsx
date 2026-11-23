import { CalendarDays } from 'lucide-react'
import type { profileWeek } from '@/lib/profile'

export default function DashboardStudyRhythm({ days }: { days: ReturnType<typeof profileWeek> }) {
  const peak = Math.max(1, ...days.map((day) => day.reviews))
  const active = days.filter((day) => day.reviews > 0).length

  return (
    <section className="dh-panel dh-pad dh-week" aria-labelledby="dashboard-rhythm">
      <div className="dh-row dh-section-title">
        <CalendarDays size={17} aria-hidden="true" />
        <h2 id="dashboard-rhythm" className="dh-title">Ritmo de estudo</h2>
      </div>
      <div className="dh-week-layout">
        <div className="dh-week-chart">
          <p className="dh-caption">Revisões nos últimos 7 dias</p>
          <ul aria-label="Revisões por dia">
            {days.map((day) => (
              <li key={day.date} aria-label={day.label + ': ' + day.reviews + (day.reviews === 1 ? ' revisão' : ' revisões')}>
                <span className="dh-week-track" aria-hidden="true"><i style={{ height: day.reviews / peak * 100 + '%' }} /></span>
                <span className="dh-week-value" aria-hidden="true">{day.reviews}</span>
                <time dateTime={day.date} aria-hidden="true">{day.weekday}</time>
              </li>
            ))}
          </ul>
        </div>
        <div className="dh-week-ring" style={{ background: 'conic-gradient(var(--dh-accent) ' + active / 7 * 100 + '%, var(--dh-track) 0)' }}>
          <div><strong>{active} / 7</strong><span>dias com revisões</span></div>
        </div>
      </div>
    </section>
  )
}
