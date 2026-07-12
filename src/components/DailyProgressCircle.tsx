'use client'

import { CheckCircle2, Flame, Award } from 'lucide-react'

interface DailyProgressCircleProps {
  reviewCount: number
  streak: number
  multiplier: number
  isGoalCompleted: boolean
}

export default function DailyProgressCircle({
  reviewCount,
  streak,
  multiplier,
  isGoalCompleted
}: DailyProgressCircleProps) {
  const goal = 10
  const percentage = Math.min(100, Math.round((reviewCount / goal) * 100))
  
  // Constantes do círculo SVG de progresso
  const radius = 38
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-sm flex items-center justify-between gap-5 group">
      {/* Background glow sutil se concluído */}
      {isGoalCompleted && (
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-emerald-500/5 to-teal-500/5 opacity-100 transition-opacity duration-300 pointer-events-none" />
      )}

      <div className="flex-1">
        <span className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">
          Progresso de Hoje
        </span>
        <h3 className="font-extrabold text-base text-text-strong tracking-wide">
          Jornada de Estudos
        </h3>
        <p className="text-xs text-text-muted mt-1 leading-snug">
          {isGoalCompleted 
            ? '🎉 Meta diária concluída! Seu multiplicador está ativo.' 
            : `Revise mais ${Math.max(0, goal - reviewCount)} cards hoje para completar a meta.`}
        </p>

        {/* XP Multiplier & Streak Badges */}
        <div className="flex items-center gap-2 mt-3.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-primary/10 text-primary border border-primary/20 rounded-md px-2 py-0.5 uppercase tracking-wider">
            <Award className="size-3" /> XP {multiplier.toFixed(1)}x
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-orange-500/10 text-orange-500 border border-orange-500/20 rounded-md px-2 py-0.5 uppercase tracking-wider">
            <Flame className="size-3" /> {streak} dia{streak !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Círculo SVG de Progresso */}
      <div className="relative flex items-center justify-center shrink-0">
        <svg className="size-24 transform -rotate-90">
          <circle
            cx="48"
            cy="48"
            r={radius}
            className="stroke-border fill-none"
            strokeWidth="7"
          />
          <circle
            cx="48"
            cy="48"
            r={radius}
            className={`fill-none transition-all duration-500 ease-out ${
              isGoalCompleted 
                ? 'stroke-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]' 
                : 'stroke-primary'
            }`}
            strokeWidth="7"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </svg>

        {/* Elemento central do círculo */}
        <div className="absolute inset-0 flex flex-col items-center justify-center select-none text-center">
          {isGoalCompleted ? (
            <CheckCircle2 className="size-8 text-emerald-500 animate-bounce" />
          ) : (
            <>
              <span className="text-lg font-black text-text-strong tracking-tighter leading-none">
                {reviewCount}
              </span>
              <span className="text-[10px] font-bold text-text-muted mt-0.5 leading-none">
                / {goal}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
