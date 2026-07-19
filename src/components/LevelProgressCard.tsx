'use client'

import { Shield, Sparkles, AlertTriangle, Flame } from 'lucide-react'
import AnimatedCounter from './AnimatedCounter'

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
    <div className={`relative overflow-hidden rounded-2xl border transition-all duration-300 p-5 shadow-[0_4px_20px_rgba(0,0,0,0.15)] group ${
      isJeopardy
        ? 'border-red-500/40 bg-gradient-to-br from-red-950/30 via-surface/90 to-surface-muted/50 shadow-[0_0_20px_rgba(239,68,68,0.12)]'
        : 'border-border/50 bg-gradient-to-br from-surface via-surface/90 to-surface-muted/40 hover:border-indigo-500/30'
    }`}>
      {/* Background glow sutil */}
      <div className={`absolute -inset-px rounded-2xl opacity-100 transition-opacity duration-300 pointer-events-none ${
        isJeopardy ? 'bg-gradient-to-r from-red-500/10 via-orange-500/5 to-transparent animate-pulse' : 'bg-gradient-to-r from-primary/5 to-indigo-500/5'
      }`} />

      <div className="flex items-center justify-between mb-3 z-10 relative">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
            <Sparkles className="size-4" />
          </span>
          <span className="text-xs font-extrabold text-text-strong uppercase tracking-wider">
            Nível {currentLevel}
          </span>
        </div>
        <span className="text-xs font-bold text-text-muted">
          <AnimatedCounter value={totalXp} /> XP total
        </span>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5 mb-4 z-10 relative">
        <div className="w-full h-2 rounded-full bg-border/40 overflow-hidden relative border border-border/10">
          <div 
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-primary transition-all duration-700 ease-out shadow-[0_0_8px_rgba(99,102,241,0.4)]" 
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-bold text-text-muted">
          <span><AnimatedCounter value={progress} /> / {range} XP para subir</span>
          <span>Nível {currentLevel + 1}</span>
        </div>
      </div>

      {/* Status da Sequência */}
      <div className="flex items-center justify-between border-t border-border/40 pt-3.5 z-10 relative">
        <div className="flex items-center gap-2">
          {isJeopardy ? (
            <Flame className="size-4 text-red-500 fill-red-500/20 animate-pulse" />
          ) : (
            <Shield className="size-4 text-emerald-500 fill-emerald-500/10" />
          )}
          <span className="text-xs font-semibold text-text-strong">
            Status da Sequência:
          </span>
        </div>
        {isJeopardy ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.2)]">
            <AlertTriangle className="size-3" /> EM PERIGO! ⚠️
          </span>
        ) : (
          <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-sm">
            SAUDÁVEL ✨
          </span>
        )}
      </div>
    </div>
  )
}

