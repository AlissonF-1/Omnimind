'use client'

import React from 'react'
import Link from 'next/link'
import { WifiOff, BrainCircuit, ArrowRight } from 'lucide-react'

interface OfflineFallbackProps {
  title?: string
  description?: string
  featureName?: string
}

export default function OfflineFallback({
  title = 'Sem Conexão com a Internet',
  description = 'Esta funcionalidade precisa de inteligência artificial na nuvem para funcionar.',
  featureName = 'Assistente IA',
}: OfflineFallbackProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95 duration-300 min-h-[60vh]">
      <div className="relative size-20 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-5 text-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.15)]">
        <WifiOff className="size-10 animate-pulse" />
      </div>

      <h3 className="text-xl sm:text-2xl font-bold text-text-strong tracking-tight mb-2">
        {title}
      </h3>

      <p className="text-sm text-text-medium max-w-md mb-6 leading-relaxed">
        {description} Que tal aproveitar esse momento para praticar suas **Revisões Ativas** que já estão salvas no seu aparelho?
      </p>

      <Link
        href="/dashboard/revisoes"
        className="flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-hover hover:to-indigo-500 text-white font-bold text-sm shadow-lg hover:shadow-indigo-500/25 transition-all active:scale-95"
      >
        <BrainCircuit className="size-5" />
        Ir para Revisão Ativa (Offline)
        <ArrowRight className="size-4" />
      </Link>

      <span className="mt-4 text-xs text-text-muted">
        O {featureName} voltará automaticamente quando a conexão for reestabelecida.
      </span>
    </div>
  )
}
