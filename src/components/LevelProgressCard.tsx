'use client'

import { Shield, Sparkles } from 'lucide-react'

interface LevelProgressCardProps {
  totalXp: number
  currentLevel: number
  streakShields: number
}

export default function LevelProgressCard({
  totalXp,
  currentLevel,
  streakShields
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

      {/* Streak Shields Badge */}
      <div className="flex items-center justify-between border-t border-border/40 pt-3.5 z-10 relative">
        <div className="flex items-center gap-2">
          <Shield className={`size-4 ${streakShields > 0 ? 'text-primary fill-primary/10' : 'text-text-muted'}`} />
          <span className="text-xs font-medium text-text-strong">
            Escudo de Streak:
          </span>
        </div>
        <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${
          streakShields > 0 
            ? 'bg-primary-soft text-primary border border-primary/20' 
            : 'bg-surface-muted text-text-muted border border-border/40'
        }`}>
          {streakShields} ativo{streakShields !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}
