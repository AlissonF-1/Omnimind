'use client'

import { useEffect, useState } from 'react'
import { Sparkles, Trophy, X } from 'lucide-react'
import { playLevelUpSound } from '@/utils/audio'

export default function LevelUpModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [levelInfo, setLevelInfo] = useState<{ oldLevel: number; newLevel: number } | null>(null)

  useEffect(() => {
    const handleLevelUp = (e: Event) => {
      const customEvent = e as CustomEvent
      if (customEvent.detail && typeof customEvent.detail.newLevel === 'number') {
        setLevelInfo({
          oldLevel: customEvent.detail.oldLevel || 1,
          newLevel: customEvent.detail.newLevel
        })
        setIsOpen(true)
        playLevelUpSound()
      }
    }

    window.addEventListener('level-up', handleLevelUp)
    return () => window.removeEventListener('level-up', handleLevelUp)
  }, [])

  if (!isOpen || !levelInfo) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
      {/* Estilo CSS do Confete / Partículas CSS customizadas sem pacotes npm */}
      <style jsx global>{`
        @keyframes particle-float {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(-100vh) rotate(360deg); opacity: 0; }
        }
        .confetti-particle {
          position: absolute;
          width: 8px;
          height: 8px;
          border-radius: 2px;
          animation: particle-float 3s linear infinite;
        }
      `}</style>

      {/* Partículas de Confete geradas localmente */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(35)].map((_, i) => {
          const colors = ['bg-primary', 'bg-indigo-500', 'bg-amber-400', 'bg-emerald-400', 'bg-rose-400', 'bg-sky-400']
          const randomColor = colors[Math.floor(Math.random() * colors.length)]
          const randomLeft = `${Math.random() * 100}%`
          const randomDelay = `${Math.random() * 2}s`
          const randomDuration = `${2 + Math.random() * 2}s`
          return (
            <div 
              key={i} 
              className={`confetti-particle ${randomColor}`}
              style={{
                left: randomLeft,
                bottom: '-20px',
                animationDelay: randomDelay,
                animationDuration: randomDuration
              }}
            />
          )
        })}
      </div>

      {/* Modal Principal Glassmorphic */}
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-primary/20 bg-surface/85 p-8 text-center shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-300">
        {/* Glow Radial centralizado */}
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,var(--primary-soft)_0%,transparent_70%)] opacity-35" />

        {/* Botão de Fechar */}
        <button 
          onClick={() => setIsOpen(false)}
          className="absolute right-4 top-4 rounded-full p-1.5 text-text-muted hover:bg-surface-muted hover:text-text-strong transition-colors"
          aria-label="Fechar"
        >
          <X className="size-5" />
        </button>

        {/* Embalagem Central do Ícone */}
        <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 text-white shadow-[0_0_30px_rgba(245,158,11,0.4)] animate-bounce">
          <Trophy className="size-10" />
        </div>

        <div className="space-y-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-500 bg-amber-500/10 px-3 py-1 rounded-full uppercase tracking-widest border border-amber-500/20">
            <Sparkles className="size-3 animate-spin" /> LEVEL UP! <Sparkles className="size-3 animate-spin" />
          </span>
          <h2 className="text-2xl font-black text-text-strong tracking-tight">
            Você atingiu o Nível {levelInfo.newLevel}!
          </h2>
          <p className="text-sm text-text-medium max-w-xs mx-auto leading-relaxed">
            Seu Segundo Cérebro está se expandindo! Continue focado e evoluindo seus limites de retenção de conhecimento.
          </p>
        </div>

        {/* Comparador de Nível */}
        <div className="my-6 flex items-center justify-center gap-4 bg-surface-muted/50 border border-border/40 rounded-2xl p-4 max-w-xs mx-auto">
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-bold text-text-muted uppercase">Anterior</span>
            <span className="text-xl font-bold text-text-muted">Nível {levelInfo.oldLevel}</span>
          </div>
          <span className="text-2xl text-primary font-black">➔</span>
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-extrabold text-primary uppercase">Novo</span>
            <span className="text-2xl font-black text-primary drop-shadow-[0_0_10px_var(--primary-soft)]">
              Nível {levelInfo.newLevel}
            </span>
          </div>
        </div>

        {/* Botão de Ação */}
        <button
          onClick={() => setIsOpen(false)}
          className="btn-primary w-full py-3 text-sm font-bold shadow-[0_4px_12px_var(--primary-soft)] rounded-xl"
        >
          Continuar Estudando
        </button>
      </div>
    </div>
  )
}
