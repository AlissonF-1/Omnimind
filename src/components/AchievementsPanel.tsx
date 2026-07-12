'use client'

import { ACHIEVEMENTS } from '@/types/achievements'
import { Trophy, Lock, Check, Music } from 'lucide-react'
import { playTrophySound } from '@/utils/audio'

interface AchievementsPanelProps {
  unlockedList: string[]
  tutorCount: number
  perfectExamsCount: number
  notesCount: number
  totalReviews: number
}

export default function AchievementsPanel({
  unlockedList,
  tutorCount,
  perfectExamsCount,
  notesCount,
  totalReviews
}: AchievementsPanelProps) {
  const unlockedSet = new Set(unlockedList || [])

  const handleTestChime = () => {
    // 1. Toca o som sintetizado de console
    playTrophySound()
    
    // 2. Dispara o evento customizado global
    window.dispatchEvent(new CustomEvent('achievement-unlocked', {
      detail: {
        id: 'test_trophy',
        title: '🏆 Testador de Conquistas',
        description: 'Você acaba de testar o popup animado e o som sintetizado!'
      }
    }))
  }

  const list = Object.values(ACHIEVEMENTS)

  return (
    <div className="space-y-6">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-text-strong">Minhas Conquistas</h2>
          <p className="text-xs text-text-muted mt-0.5">Veja seus marcos alcançados e troféus desbloqueados.</p>
        </div>

        <button 
          onClick={handleTestChime}
          className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5 shrink-0 self-start sm:self-auto border border-amber-500/20 hover:border-amber-500/40 text-amber-400 hover:text-amber-300"
        >
          <Music className="size-3.5" />
          Testar Som de Troféu
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {list.map((item) => {
          const isUnlocked = unlockedSet.has(item.id)
          
          // Calcula progresso específico por troféu
          let currentVal = 0
          let targetVal = 1
          if (item.id === 'o_inicio') {
            currentVal = totalReviews
            targetVal = 1
          } else if (item.id === 'a_chama') {
            currentVal = totalReviews >= 1 ? (unlockedSet.has('a_chama') ? 7 : 0) : 0
            targetVal = 7
          } else if (item.id === 'o_arquivista') {
            currentVal = notesCount
            targetVal = 50
          } else if (item.id === 'a_banca') {
            currentVal = perfectExamsCount
            targetVal = 10
          } else if (item.id === 'o_tutor') {
            currentVal = tutorCount
            targetVal = 20
          } else if (item.id === 'o_planejador') {
            currentVal = unlockedSet.has('o_planejador') ? 1 : 0
            targetVal = 1
          }

          const progressPercent = Math.min(100, Math.round((currentVal / targetVal) * 100))

          return (
            <div 
              key={item.id}
              className={`relative overflow-hidden rounded-2xl border p-5 flex items-start gap-4 transition-all duration-300 ${
                isUnlocked 
                  ? 'bg-surface border-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.03)]' 
                  : 'bg-surface-muted/50 border-border opacity-70'
              }`}
            >
              {/* Efeito glow no fundo se estiver liberado */}
              {isUnlocked && (
                <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-amber-500/5 to-yellow-500/5 opacity-100 transition-opacity duration-300 pointer-events-none" />
              )}

              {/* Ícone do Troféu */}
              <div className={`p-3 rounded-xl shrink-0 transition-colors ${
                isUnlocked 
                  ? 'bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/25' 
                  : 'bg-slate-800 text-slate-500'
              }`}>
                {isUnlocked ? <Trophy className="size-6 animate-pulse" /> : <Lock className="size-6" />}
              </div>

              {/* Textos da conquista */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className={`font-bold text-sm truncate ${isUnlocked ? 'text-text-strong' : 'text-text-muted'}`}>
                    {item.title}
                  </h4>
                  {isUnlocked && (
                    <span className="flex items-center gap-0.5 text-[8px] bg-emerald-500/10 text-emerald-500 font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                      <Check className="size-2" /> Liberada
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-muted mt-1 leading-snug break-words">
                  {item.description}
                </p>

                {/* Barra de progresso para bloqueados */}
                {!isUnlocked && (
                  <div className="mt-3.5">
                    <div className="flex items-center justify-between text-[9px] text-text-muted font-bold mb-1">
                      <span>Progresso</span>
                      <span>{currentVal} / {targetVal} ({progressPercent}%)</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-amber-500 transition-all duration-500" 
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
