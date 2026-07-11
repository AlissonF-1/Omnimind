'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, ArrowRight, BrainCircuit, Flame } from 'lucide-react'
import Link from 'next/link'

interface DashboardRelearningAlertProps {
  topAlert?: {
    workspaceId: string
    workspaceName: string
    criticalCount: number
  }
}

export default function DashboardRelearningAlert({ topAlert }: DashboardRelearningAlertProps) {
  const [isDismissed, setIsDismissed] = useState(true) // Começa true para evitar flicker no SSR
  
  // Nível de urgência dinâmico
  const isSevere = (topAlert?.criticalCount ?? 0) >= 20

  // Cores dinâmicas baseadas na severidade
  const colorTheme = isSevere
    ? {
        border: 'border-error/30 bg-error-soft/50',
        icon: 'text-error',
        iconBg: 'bg-error/20',
        textStrong: 'text-error-strong',
        textMuted: 'text-error/80',
        buttonBg: 'bg-error hover:bg-error-hover',
      }
    : {
        border: 'border-orange-500/30 bg-orange-500/10',
        icon: 'text-orange-600',
        iconBg: 'bg-orange-500/20',
        textStrong: 'text-orange-700 dark:text-orange-300',
        textMuted: 'text-orange-800/80 dark:text-orange-200/80',
        buttonBg: 'bg-orange-600 hover:bg-orange-700',
      }

  useEffect(() => {
    if (!topAlert) return

    // Verifica se o usuário já descartou esse alerta HOJE
    const storageKey = `dismissed_relearning_${topAlert.workspaceId}`
    const dismissedAt = sessionStorage.getItem(storageKey)
    
    if (!dismissedAt) {
      setIsDismissed(false)
    }
  }, [topAlert])

  const handleDismiss = () => {
    if (!topAlert) return
    setIsDismissed(true)
    const storageKey = `dismissed_relearning_${topAlert.workspaceId}`
    sessionStorage.setItem(storageKey, new Date().toISOString())
  }

  // Guard Clause de segurança
  if (!topAlert || topAlert.criticalCount === 0 || isDismissed) return null

  return (
    <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className={`relative overflow-hidden rounded-2xl border p-6 shadow-sm transition-colors ${colorTheme.border}`}>
        <div className="absolute -right-4 -top-4 opacity-10 pointer-events-none">
          <BrainCircuit className={`size-32 ${colorTheme.icon}`} />
        </div>

        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className={`mt-1 flex size-10 shrink-0 items-center justify-center rounded-full ${colorTheme.iconBg} ${colorTheme.icon}`}>
              {isSevere ? <Flame className="size-5" /> : <AlertTriangle className="size-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`text-lg font-bold ${colorTheme.icon}`}>
                  {isSevere ? 'Risco Crítico de Esquecimento' : 'Risco de Esquecimento'}
                </h3>
              </div>
              <p className={`mt-1 max-w-xl text-sm font-medium ${colorTheme.textMuted}`}>
                A curva do FSRS detectou que você está prestes a esquecer{' '}
                <strong className={`font-bold ${colorTheme.textStrong}`}>{topAlert.criticalCount} conceitos</strong>{' '}
                da matéria de <strong className={`font-bold ${colorTheme.textStrong}`}>"{topAlert.workspaceName}"</strong>.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3 pt-2 sm:pt-0">
            <button
              onClick={handleDismiss}
              className={`text-sm font-medium ${colorTheme.textMuted} hover:${colorTheme.textStrong} transition-colors`}
            >
              Descartar
            </button>
            <Link
              // Roteamento inteligente indo direto para a matéria e sugerindo um filtro
              href={`/dashboard/${topAlert.workspaceId}/review?mode=critical`}
              className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white shadow-sm transition-colors ${colorTheme.buttonBg}`}
            >
              Salvar Memória
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}