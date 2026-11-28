'use client'

import { useSyncExternalStore } from 'react'
import { Award, CheckCircle2, Target } from '@/components/icons'
import Link from 'next/link'

interface DailyProgressCircleProps {
  reviewCount: number
  multiplier: number
  dailyGoal?: number
  activeGoalTitle?: string | null
}

function subscribeToCramming(notify: () => void) {
  window.addEventListener('storage', notify)
  return () => window.removeEventListener('storage', notify)
}

function readCrammingMode() {
  try {
    return window.localStorage.getItem('omnimind_cramming_mode') === 'true'
  } catch {
    return false
  }
}

export default function DailyProgressCircle({
  reviewCount, multiplier, dailyGoal, activeGoalTitle,
}: DailyProgressCircleProps) {
  const localCramming = useSyncExternalStore(subscribeToCramming, readCrammingMode, () => false)
  const goal = localCramming ? 30 : dailyGoal || 10
  const completed = reviewCount >= goal
  const remaining = Math.max(0, goal - reviewCount)
  const radius = 40
  const circumference = 2 * Math.PI * radius

  return (
    <article className="dh-panel dh-pad dh-goal">
      <div className="min-w-0">
        <p className="dh-eyebrow">Progresso de hoje</p>
        <h3 className="dh-title">Meta diária</h3>
        {completed ? (
          <p className="dh-row dh-positive text-sm font-semibold"><CheckCircle2 size={15} aria-hidden="true" /> Meta concluída</p>
        ) : (
          <p className="dh-caption">
            {'Faltam ' + remaining + (remaining === 1 ? ' revisão.' : ' revisões.')}
          </p>
        )}

        <div className="dh-row gap-x-2 gap-y-1">
          {localCramming ? (
            <span className="dh-pill dh-warning"><Target size={12} aria-hidden="true" /> Modo Véspera</span>
          ) : activeGoalTitle ? (
            <Link href="/dashboard/calendario" className="dh-pill dh-accent">
              <Target size={12} className="shrink-0" aria-hidden="true" /> {activeGoalTitle}
            </Link>
          ) : null}
          <span className="dh-pill dh-accent"><Award size={12} aria-hidden="true" /> XP {multiplier.toFixed(1)}x</span>
        </div>
      </div>

      <div className={'dh-goal-graphic' + (completed ? ' dh-positive' : '')} role="progressbar"
        aria-label="Progresso da meta diária" aria-valuemin={0} aria-valuemax={goal}
        aria-valuenow={Math.min(reviewCount, goal)} aria-valuetext={reviewCount + ' de ' + goal + ' revisões'}
      >
        <div className="dh-ring">
          <svg viewBox="0 0 96 96" aria-hidden="true">
            <circle className="dh-ring-track" cx={48} cy={48} r={radius} stroke="currentColor" strokeWidth={7} fill="none" />
            <circle cx={48} cy={48} r={radius} fill="none" stroke="currentColor" strokeWidth={7}
              transform="rotate(-90 48 48)" strokeLinecap="round" strokeDasharray={circumference}
              strokeDashoffset={circumference * (remaining / goal)}
            />
          </svg>
          <span className="dh-ring-value"><strong>{reviewCount}</strong><span>/ {goal}</span></span>
        </div>
        <div className="dh-goal-bar" aria-hidden="true">
          <progress className="dh-progress" value={Math.min(reviewCount, goal)} max={goal} />
          <div className="dh-row dh-between"><span>{reviewCount} / {goal} revisões</span><span>{Math.min(100, Math.round(reviewCount * 100 / goal))}%</span></div>
        </div>
      </div>
    </article>
  )
}
