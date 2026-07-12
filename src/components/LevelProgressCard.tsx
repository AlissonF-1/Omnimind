'use client'

import { Shield, Sparkles } from 'lucide-react'

interface LevelProgressCardProps {
  totalXp: number
  currentLevel: number
  streakShields: number
  isJeopardy?: boolean
}

export default function LevelProgressCard({
  totalXp,
  currentLevel,
  streakShields,
  isJeopardy
}: LevelProgressCardProps) {
  // Fórmula de nível reversa para progresso
  const xpForCurrentLevel = Math.pow(currentLevel - 1, 2) * 5
  const xpForNextLevel = Math.pow(currentLevel, 2) * 5
  const range = xpForNextLevel - xpForCurrentLevel
  const progress = totalXp - xpForCurrentLevel
  const percent = Math.min(Math.max((progress / range) * 100, 0), 100)

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-sm group">
      {/* Background glow sutil */}
      <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-primary/5 to-indigo-500/5 opacity-100 transition-opacity duration-300 pointer-events-none" />

      <div className="flex items-center justify-between mb-3 z-10 relative">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
            <Sparkles className="size-4" />
          </span>
          <span className="text-xs font-bold text-text-strong uppercase tracking-wider">
            Nível {currentLevel}
          </span>
        </div>
        <span className="text-xs font-semibold text-text-muted">
          {totalXp} XP total
        </span>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5 mb-4 z-10 relative">
        <div className="w-full h-2 rounded-full bg-border/50 overflow-hidden relative border border-border/10">
          <div 
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-primary transition-all duration-500 ease-out" 
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-semibold text-text-muted">
          <span>{progress} / {range} XP para subir</span>
          <span>Nível {currentLevel + 1}</span>
        </div>
      </div>

      {/* Status da Sequência */}
      <div className="flex items-center justify-between border-t border-border/40 pt-3.5 z-10 relative">
        <div className="flex items-center gap-2">
          <Shield className={`size-4 ${isJeopardy ? 'text-rose-500 fill-rose-500/10' : 'text-emerald-500 fill-emerald-500/10'}`} />
          <span className="text-xs font-medium text-text-strong">
            Status da Sequência:
          </span>
        </div>
        {isJeopardy ? (
          <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20 animate-pulse">
            EM RISCO 🔥
          </span>
        ) : (
          <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            SAUDÁVEL ✨
          </span>
        )}
      </div>
    </div>
  )
}
