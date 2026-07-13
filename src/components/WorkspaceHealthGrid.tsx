'use client'

import Link from 'next/link'
import { Activity, ShieldAlert, ShieldCheck, ShieldAlert as WarningIcon, ArrowUpRight, BookOpen } from 'lucide-react'

interface WorkspaceHealth {
  id: string
  name: string
  description: string | null
  score: number
  status: 'green' | 'yellow' | 'red'
  totalCards: number
  reviewedCards: number
}

interface WorkspaceHealthGridProps {
  healths: WorkspaceHealth[]
}

const getStatusStyles = (status: 'green' | 'yellow' | 'red') => {
  switch (status) {
    case 'red':
      return {
        border: 'border-rose-500/20 hover:border-rose-500/35',
        bg: 'bg-rose-500/5',
        glow: 'shadow-[0_0_15px_rgba(244,63,94,0.07)] hover:shadow-[0_0_25px_rgba(244,63,94,0.12)]',
        badge: 'bg-rose-500/10 text-rose-500 border border-rose-500/20',
        bar: 'bg-rose-500',
        icon: <ShieldAlert className="size-4 text-rose-500" />,
        label: 'Alerta Crítico'
      }
    case 'yellow':
      return {
        border: 'border-amber-500/20 hover:border-amber-500/35',
        bg: 'bg-amber-500/5',
        glow: 'shadow-[0_0_15px_rgba(245,158,11,0.07)] hover:shadow-[0_0_25px_rgba(245,158,11,0.12)]',
        badge: 'bg-amber-500/10 text-amber-500 border border-amber-500/20',
        bar: 'bg-amber-500',
        icon: <WarningIcon className="size-4 text-amber-500" />,
        label: 'Atenção'
      }
    case 'green':
    default:
      return {
        border: 'border-emerald-500/20 hover:border-emerald-500/35',
        bg: 'bg-emerald-500/5',
        glow: 'shadow-[0_0_15px_rgba(16,185,129,0.07)] hover:shadow-[0_0_25px_rgba(16,185,129,0.12)]',
        badge: 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20',
        bar: 'bg-emerald-500',
        icon: <ShieldCheck className="size-4 text-emerald-500" />,
        label: 'Saudável'
      }
  }
}

export default function WorkspaceHealthGrid({ healths }: WorkspaceHealthGridProps) {
  // Limita a exibição ao grid 2x3 (máximo 6 workspaces)
  const activeHealths = healths.slice(0, 6)

  if (activeHealths.length === 0) return null

  return (
    <section className="space-y-3.5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
          <Activity className="size-4 text-primary" /> Índice de Retenção por Workspace
        </h2>
        <span className="text-[10px] font-semibold text-text-muted">Últimos 7 dias</span>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {activeHealths.map((ws) => {
          const styles = getStatusStyles(ws.status)
          return (
            <Link
              key={ws.id}
              href={`/dashboard/${ws.id}`}
              className={`panel relative p-5 group flex flex-col justify-between transition-all duration-300 border ${styles.border} ${styles.bg} ${styles.glow} rounded-2xl hover:-translate-y-0.5 overflow-hidden`}
            >
              {/* Sutil glow de fundo */}
              <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.015),transparent)] pointer-events-none" />

              <div className="space-y-3 flex-1">
                {/* Cabeçalho do Card */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <h3 className="text-sm font-bold text-text-strong group-hover:text-primary transition-colors truncate">
                      {ws.name}
                    </h3>
                    <p className="text-[11px] text-text-muted truncate max-w-[180px]">
                      {ws.description || 'Sem descrição'}
                    </p>
                  </div>
                  
                  {/* Badge de Status */}
                  <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${styles.badge}`}>
                    {styles.icon} {styles.label}
                  </span>
                </div>

                {/* Score Circular / Estatística de Saúde */}
                <div className="flex items-baseline gap-1 pt-1">
                  <span className="text-3xl font-black text-text-strong tracking-tight">
                    {ws.score}%
                  </span>
                  <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                    de retenção
                  </span>
                </div>
              </div>

              {/* Estatísticas de Cards e Barra de Progresso */}
              <div className="space-y-2 mt-4 pt-3.5 border-t border-border/40">
                <div className="flex justify-between items-center text-[10px] font-semibold text-text-muted">
                  <span className="flex items-center gap-1">
                    <BookOpen className="size-3 text-primary-soft text-primary" /> {ws.totalCards} cards no total
                  </span>
                  <span>{ws.reviewedCards} revisados</span>
                </div>

                {/* Barra horizontal indicando o percentual de retenção */}
                <div className="w-full h-1.5 rounded-full bg-border/40 overflow-hidden relative">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${styles.bar}`}
                    style={{ width: `${ws.score}%` }}
                  />
                </div>
                
                {/* Atalho flutuante no hover */}
                <div className="absolute right-3.5 bottom-3 text-text-muted opacity-0 group-hover:opacity-100 group-hover:text-primary transition-all duration-300 transform translate-x-1 translate-y-1 group-hover:translate-x-0 group-hover:translate-y-0">
                  <ArrowUpRight className="size-4" />
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
