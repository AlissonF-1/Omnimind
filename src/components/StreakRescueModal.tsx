'use client'

import { useState, useEffect } from 'react'
import { Flame, Sparkles, X } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface StreakRescueModalProps {
  isJeopardy: boolean
  potentialStreak: number
}

export default function StreakRescueModal({
  isJeopardy,
  potentialStreak
}: StreakRescueModalProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)

  // Dispara a exibição apenas se estiver em perigo e o usuário ainda não tiver fechado nesta sessão
  useEffect(() => {
    if (isJeopardy) {
      const isDismissed = sessionStorage.getItem('streak-rescue-dismissed')
      if (!isDismissed) {
        setIsOpen(true)
      }
    }
  }, [isJeopardy])

  if (!isOpen) return null

  const handleClose = () => {
    setIsOpen(false)
    sessionStorage.setItem('streak-rescue-dismissed', 'true')
  }

  const handleStartRescue = () => {
    handleClose()
    router.push('/dashboard/revisoes')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-300">
      {/* Modal Principal Glassmorphic */}
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-orange-500/20 bg-surface/85 p-8 text-center shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-300">
        
        {/* Glow Radial centralizado */}
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,rgba(249,115,22,0.15)_0%,transparent_70%)] opacity-100" />

        {/* Botão de Fechar */}
        <button 
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-text-muted hover:bg-surface-muted hover:text-text-strong transition-colors"
          aria-label="Fechar"
        >
          <X className="size-5" />
        </button>

        {/* Embalagem Central do Ícone */}
        <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-gradient-to-tr from-orange-600 to-amber-400 text-white shadow-[0_0_30px_rgba(249,115,22,0.4)] animate-pulse">
          <Flame className="size-11 fill-current" />
        </div>

        <div className="space-y-3 mb-6">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-orange-500 bg-orange-500/10 px-3 py-1 rounded-full uppercase tracking-widest border border-orange-500/20">
            <Sparkles className="size-3" /> Sequência em Perigo! <Sparkles className="size-3" />
          </span>
          <h2 className="text-2xl font-black text-text-strong tracking-tight">
            Salve sua Streak de {potentialStreak} dias!
          </h2>
          <p className="text-sm text-text-medium max-w-xs mx-auto leading-relaxed">
            Você não realizou revisões ontem. Complete o **Desafio de Resgate** respondendo a **2 flashcards seguidos com 100% de acerto** para restabelecer seu combo!
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            onClick={handleStartRescue}
            className="w-full btn-primary h-12 text-sm font-bold rounded-2xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(249,115,22,0.2)] hover:shadow-[0_6px_16px_rgba(249,115,22,0.3)] transition-all active:scale-98"
          >
            Iniciar Resgate ⚡
          </button>
          <button
            onClick={handleClose}
            className="w-full btn-secondary h-12 text-sm font-semibold rounded-2xl hover:bg-surface-hover transition-colors text-text-muted hover:text-text-strong"
          >
            Talvez mais tarde
          </button>
        </div>
      </div>
    </div>
  )
}
