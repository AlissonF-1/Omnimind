'use client'

import { TrendingUp, TrendingDown, ArrowRight } from 'lucide-react'
import Link from 'next/link'

interface DashboardStatsCardsProps {
  totalCards: number
  overdueCards: number
  streak: number
  retentionRate: number
  trends?: {
    retention?: { value: number; isPositive: boolean }
    totalCards?: { value: number; isPositive: boolean }
  }
}

// Estimativa ingênua mas útil: ~45 seg por card em média
function estimateMinutes(count: number): string {
  const mins = Math.round((count * 45) / 60)
  if (mins < 1) return '< 1 min'
  if (mins === 1) return '1 min'
  return `${mins} min`
}

export default function DashboardStatsCards({
  totalCards,
  overdueCards,
  streak,
  retentionRate,
  trends,
}: DashboardStatsCardsProps) {
  const hasOverdue = overdueCards > 0
  const overdueSeverity =
    overdueCards === 0
      ? { bar: 'bg-success', text: 'text-success', badge: 'bg-success/10 text-success border-success/20' }
      : overdueCards < 20
      ? { bar: 'bg-warning', text: 'text-warning', badge: 'bg-warning/10 text-warning border-warning/20' }
      : { bar: 'bg-error', text: 'text-error', badge: 'bg-error/10 text-error border-error/20' }

  return (
    <div className="space-y-4">

      {/* ── CTA principal ──────────────────────────────────────── */}
      {hasOverdue ? (
        <Link
          href="/dashboard/revisoes"
          className="group relative flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-5 transition-all hover:border-primary/40 hover:bg-surface-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary overflow-hidden"
        >
          {/* barra lateral colorida */}
          <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl ${overdueSeverity.bar}`} />

          <div className="pl-3">
            <p className="text-xs font-medium text-text-muted mb-1">Cards pendentes</p>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-bold tracking-tight ${overdueSeverity.text}`}>
                {overdueCards}
              </span>
              <span className="text-sm text-text-muted">
                ≈ {estimateMinutes(overdueCards)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors group-hover:bg-primary/90">
              Revisar agora
            </span>
            <ArrowRight className="size-4 text-text-muted transition-transform group-hover:translate-x-0.5" />
          </div>
        </Link>
      ) : (
        <div className="relative flex items-center gap-4 rounded-xl border border-success/20 bg-success/5 p-5 overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl bg-success" />
          <div className="pl-3">
            <p className="text-xs font-medium text-text-muted mb-1">Revisões</p>
            <p className="text-lg font-semibold text-success">Tudo em dia!</p>
          </div>
        </div>
      )}

      {/* ── Linha de stats secundários ─────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">

        {/* Sequência */}
        <div className="rounded-xl bg-surface-muted/50 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted mb-2">
            Sequência
          </p>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-2xl font-bold tracking-tight ${
                streak > 0 ? 'text-orange-500' : 'text-text-strong'
              }`}
            >
              {streak}
            </span>
            <span className="text-xs text-text-muted">dias</span>
          </div>
          {streak > 0 && (
            <p className="text-[10px] text-orange-500/70 mt-1">🔥 em sequência</p>
          )}
        </div>

        {/* Retenção */}
        <div className="rounded-xl bg-surface-muted/50 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted mb-2">
            Retenção
          </p>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-2xl font-bold tracking-tight ${
                retentionRate >= 85 ? 'text-success' : 'text-warning'
              }`}
            >
              {retentionRate}
            </span>
            <span className="text-xs text-text-muted">%</span>
          </div>
          {trends?.retention && (
            <div
              className={`flex items-center gap-1 mt-1 text-[10px] font-medium ${
                trends.retention.isPositive ? 'text-success' : 'text-error'
              }`}
            >
              {trends.retention.isPositive ? (
                <TrendingUp className="size-3" />
              ) : (
                <TrendingDown className="size-3" />
              )}
              {trends.retention.value}%
            </div>
          )}
        </div>

        {/* Total */}
        <div className="rounded-xl bg-surface-muted/50 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted mb-2">
            Total
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold tracking-tight text-text-strong">
              {totalCards}
            </span>
            <span className="text-xs text-text-muted">cards</span>
          </div>
          {trends?.totalCards && (
            <div
              className={`flex items-center gap-1 mt-1 text-[10px] font-medium ${
                trends.totalCards.isPositive ? 'text-success' : 'text-error'
              }`}
            >
              {trends.totalCards.isPositive ? (
                <TrendingUp className="size-3" />
              ) : (
                <TrendingDown className="size-3" />
              )}
              {trends.totalCards.value} novos
            </div>
          )}
        </div>

      </div>
    </div>
  )
}