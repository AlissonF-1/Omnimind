'use client'

import { useState, useEffect } from 'react'
import { CheckCircle2, Flame, Award, Target } from 'lucide-react'
import Link from 'next/link'
import AnimatedCounter from './AnimatedCounter'

interface DailyProgressCircleProps {
  reviewCount: number
  streak: number
  multiplier: number
  isGoalCompleted: boolean
  dailyGoal?: number
  activeGoalTitle?: string | null
}

export default function DailyProgressCircle({
  reviewCount,
  streak,
  multiplier,
  isGoalCompleted,
  dailyGoal,
  activeGoalTitle
}: DailyProgressCircleProps) {
  const [localCramming, setLocalCramming] = useState(false)
  const [animatedPercentage, setAnimatedPercentage] = useState(0)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setLocalCramming(localStorage.getItem('omnimind_cramming_mode') === 'true')
    }
  }, [])

  const goal = localCramming ? 30 : (dailyGoal || 10)
  const isGoalCompletedToday = localCramming ? (reviewCount >= 30) : isGoalCompleted
  const isDynamic = !localCramming && !!dailyGoal && dailyGoal !== 10
  const percentage = Math.min(100, Math.round((reviewCount / goal) * 100))

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedPercentage(percentage)
    }, 150)
    return () => clearTimeout(timer)
  }, [percentage])

  // Constantes do circulo SVG de progresso
  const radius = 38
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (animatedPercentage / 100) * circumference

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-surface via-surface/90 to-surface-muted/40 p-5 shadow-[0_4px_20px_rgba(0,0,0,0.15)] flex items-center justify-between gap-5 group hover:border-primary/30 transition-all duration-300">
      {/* Background glow sutil se concluido */}
      {isGoalCompletedToday && (
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent opacity-100 transition-opacity duration-300 pointer-events-none" />
      )}

      <div className="flex-1 min-w-0">
        <span className="block text-[10px] font-extrabold text-text-muted uppercase tracking-wider mb-1">
          Progresso de Hoje
        </span>
        <h3 className="font-extrabold text-base text-text-strong tracking-wide">
          Jornada de Estudos
        </h3>

        {/* Badge de meta ajustada (so aparece se tiver prova cadastrada) */}
        {isDynamic && activeGoalTitle && (
          <Link href="/dashboard/calendario" className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 rounded-md px-2 py-0.5 hover:bg-primary/20 transition-all">
            <Target className="size-3" /> Meta ajustada: {activeGoalTitle}
          </Link>
        )}
        {isDynamic && !activeGoalTitle && (
          <Link href="/dashboard/calendario" className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 rounded-md px-2 py-0.5 hover:bg-primary/20 transition-all">
            <Target className="size-3" /> Meta ajustada para prova
          </Link>
        )}

        {/* Badge do Modo Sobrevivência */}
        {localCramming && (
          <div className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold text-orange-500 bg-orange-500/10 border border-orange-500/20 rounded-md px-2 py-0.5 animate-pulse">
            <Target className="size-3" /> 🚨 Modo Véspera Ativo
          </div>
        )}

        <p className="text-xs text-text-muted mt-2 leading-snug font-medium">
          {isGoalCompletedToday 
            ? '🎉 Meta diária concluída! Seu multiplicador está ativo.' 
            : `Revise mais ${Math.max(0, goal - reviewCount)} cards hoje para completar a meta.`}
        </p>

        {/* XP Multiplier & Streak Badges */}
        <div className="flex items-center gap-2 mt-3">
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-primary/10 text-primary border border-primary/20 rounded-md px-2 py-0.5 uppercase tracking-wider shadow-sm">
            <Award className="size-3" /> XP {multiplier.toFixed(1)}x
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-orange-500/10 text-orange-500 border border-orange-500/20 rounded-md px-2 py-0.5 uppercase tracking-wider shadow-sm">
            <Flame className="size-3" /> <AnimatedCounter value={streak} /> dia{streak !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Circulo SVG de Progresso */}
      <div className="relative flex items-center justify-center shrink-0">
        <svg className="size-24 transform -rotate-90">
          <circle
            cx="48"
            cy="48"
            r={radius}
            className="stroke-border/40 fill-none"
            strokeWidth="7"
          />
          <circle
            cx="48"
            cy="48"
            r={radius}
            className={`fill-none transition-all duration-1000 ease-out ${
              isGoalCompletedToday 
                ? 'stroke-emerald-500 drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]' 
                : (isDynamic ? 'stroke-violet-500 drop-shadow-[0_0_8px_rgba(139,92,246,0.3)]' : (localCramming ? 'stroke-orange-500' : 'stroke-primary drop-shadow-[0_0_8px_rgba(249,115,22,0.3)]'))
            }`}
            strokeWidth="7"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </svg>

        {/* Elemento central do circulo */}
        <div className="absolute inset-0 flex flex-col items-center justify-center select-none text-center">
          {isGoalCompletedToday ? (
            <CheckCircle2 className="size-8 text-emerald-500 animate-bounce drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
          ) : (
            <>
              <span className="text-xl font-black text-text-strong tracking-tighter leading-none">
                <AnimatedCounter value={reviewCount} />
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

