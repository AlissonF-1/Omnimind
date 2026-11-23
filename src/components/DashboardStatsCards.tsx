import Image from 'next/image'
import { Clock3, TrendingDown, TrendingUp } from 'lucide-react'

interface DashboardStatsCardsProps {
  totalCards: number
  streak: number
  retentionRate: number
  weeklyReviews: number
  trends?: {
    retention?: { value: number; isPositive: boolean }
    totalCards?: { value: number; isPositive: boolean }
  }
}

export default function DashboardStatsCards({ totalCards, streak, retentionRate, weeklyReviews, trends }: DashboardStatsCardsProps) {
  const metrics = [
    { label: 'Sequência', image: '/images/stat_streak_3d.png', number: streak, suffix: streak === 1 ? 'dia' : 'dias', color: 'dh-warning' },
    { label: 'Retenção', image: '/images/stat_retention_3d.png', number: totalCards > 0 ? retentionRate : '—', suffix: totalCards > 0 ? '%' : undefined, color: 'dh-positive', trend: trends?.retention, trendSuffix: '%' },
    { label: 'Flashcards', image: '/images/stat_cards_3d.png', number: totalCards, color: 'dh-accent', trend: trends?.totalCards, trendSuffix: ' novos' },
  ]

  return (
    <dl aria-label="Visão geral dos flashcards" className="dh-panel dh-metrics">
      {metrics.map(({ label, image, number, suffix, color, trend, trendSuffix }) => {
        const Trend = trend?.isPositive ? TrendingUp : TrendingDown
        return (
          <div className="dh-metric" key={label}>
            <dt>{label}<Image className="dh-metric-art" src={image} alt="" width={41} height={41} /></dt>
            <dd className={color}>{number}{suffix && <span> {suffix}</span>}</dd>
            {trend && (
              <dd className={'dh-row !text-xs mt-1 ' + (trend.isPositive ? 'dh-positive' : 'dh-danger')}>
                <Trend size={13} aria-hidden="true" /> {trend.value}{trendSuffix}
              </dd>
            )}
          </div>
        )
      })}
      <div className="dh-metric dh-week-metric">
        <dt>Revisões na semana<span className="dh-metric-art dh-metric-clock"><Clock3 size={21} aria-hidden="true" /></span></dt>
        <dd className="dh-accent">{weeklyReviews}</dd>
      </div>
    </dl>
  )
}
