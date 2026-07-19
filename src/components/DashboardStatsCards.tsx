'use client'

import { TrendingUp, TrendingDown, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import AnimatedCounter from './AnimatedCounter'

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
          className="group relative flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-gradient-to-br from-surface via-surface/90 to-surface-muted/40 p-5 shadow-[0_4px_20px_rgba(0,0,0,0.15)] transition-all duration-300 hover:border-primary/40 hover:shadow-[0_8px_30px_rgba(0,0,0,0.25)] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary overflow-hidden"
        >
          {/* barra lateral colorida */}
          <div className={`absolute left-0 top-0 bottom-0 w-[4px] rounded-l-2xl ${overdueSeverity.bar}`} />

          <div className="pl-3 flex-1">
            <p className="text-xs font-medium text-text-muted mb-1">Cards pendentes</p>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-extrabold tracking-tight ${overdueSeverity.text}`}>
                <AnimatedCounter value={overdueCards} />
              </span>
              <span className="text-sm text-text-muted font-medium">
                ≈ {estimateMinutes(overdueCards)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="relative size-12 overflow-hidden rounded-xl hidden sm:block drop-shadow-md">
              <Image src="/images/stat_overdue_3d.png" alt="Pendentes" fill className="object-cover transition-transform group-hover:scale-105 duration-300" />
            </div>
            <span className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-all shadow-[0_4px_12px_rgba(249,115,22,0.25)] group-hover:bg-primary/90 group-hover:shadow-[0_6px_16px_rgba(249,115,22,0.35)]">
              Revisar agora
            </span>
            <ArrowRight className="size-4 text-text-muted transition-transform group-hover:translate-x-1" />
          </div>
        </Link>
      ) : (
        <div className="relative flex items-center gap-4 rounded-2xl border border-success/30 bg-gradient-to-br from-success/10 via-surface/90 to-surface-muted/40 p-5 shadow-[0_4px_20px_rgba(0,0,0,0.15)] overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-[4px] rounded-l-2xl bg-success" />
          <div className="pl-3">
            <p className="text-xs font-medium text-text-muted mb-1">Revisões</p>
            <p className="text-lg font-bold text-success">Tudo em dia! Meta cumprida 🎉</p>
          </div>
        </div>
      )}

      {/* ── Linha de stats secundários ─────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">

        {/* Sequência */}
        <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-surface via-surface/90 to-surface-muted/40 p-4 relative overflow-hidden group shadow-[0_2px_10px_rgba(0,0,0,0.12)] hover:border-orange-500/30 hover:shadow-[0_6px_20px_rgba(249,115,22,0.1)] transition-all duration-300">
          <div className="absolute top-2.5 right-2.5 opacity-90 sm:opacity-40 group-hover:opacity-100 transition-all duration-300 size-10 rounded-lg overflow-hidden group-hover:scale-110">
            <Image src="/images/stat_streak_3d.png" alt="Ofensiva" fill className="object-cover" />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-2 relative z-10">
            Sequência
          </p>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-2xl font-extrabold tracking-tight ${
                streak > 0 ? 'text-orange-500 drop-shadow-[0_0_8px_rgba(249,115,22,0.3)]' : 'text-text-strong'
              }`}
            >
              <AnimatedCounter value={streak} />
            </span>
            <span className="text-xs text-text-muted font-medium">dias</span>
          </div>
          {streak > 0 && (
            <p className="text-[10px] font-semibold text-orange-500/80 mt-1 flex items-center gap-1">
              <span className="inline-block animate-pulse">🔥</span> em sequência
            </p>
          )}
        </div>

        {/* Retenção */}
        <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-surface via-surface/90 to-surface-muted/40 p-4 relative overflow-hidden group shadow-[0_2px_10px_rgba(0,0,0,0.12)] hover:border-emerald-500/30 hover:shadow-[0_6px_20px_rgba(16,185,129,0.1)] transition-all duration-300">
          <div className="absolute top-2.5 right-2.5 opacity-90 sm:opacity-40 group-hover:opacity-100 transition-all duration-300 size-10 rounded-lg overflow-hidden group-hover:scale-110">
            <Image src="/images/stat_retention_3d.png" alt="Retenção" fill className="object-cover" />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-2 relative z-10">
            Retenção
          </p>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-2xl font-extrabold tracking-tight ${
                retentionRate >= 85 ? 'text-success drop-shadow-[0_0_8px_rgba(34,197,94,0.3)]' : 'text-warning'
              }`}
            >
              <AnimatedCounter value={retentionRate} />
            </span>
            <span className="text-xs text-text-muted font-medium">%</span>
          </div>
          {trends?.retention && (
            <div
              className={`flex items-center gap-1 mt-1 text-[10px] font-semibold ${
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
        <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-surface via-surface/90 to-surface-muted/40 p-4 relative overflow-hidden group col-span-2 sm:col-span-1 shadow-[0_2px_10px_rgba(0,0,0,0.12)] hover:border-primary/30 hover:shadow-[0_6px_20px_rgba(249,115,22,0.1)] transition-all duration-300">
          <div className="absolute top-2.5 right-2.5 opacity-90 sm:opacity-40 group-hover:opacity-100 transition-all duration-300 size-10 rounded-lg overflow-hidden group-hover:scale-110">
            <Image src="/images/stat_cards_3d.png" alt="Cards" fill className="object-cover" />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-2 relative z-10">
            Total
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-extrabold tracking-tight text-text-strong">
              <AnimatedCounter value={totalCards} />
            </span>
            <span className="text-xs text-text-muted font-medium">cards</span>
          </div>
          {trends?.totalCards && (
            <div
              className={`flex items-center gap-1 mt-1 text-[10px] font-semibold ${
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