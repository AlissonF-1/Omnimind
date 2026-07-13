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
          } else if (item.id.startsWith('o_arquivista')) {
            currentVal = notesCount
            if (item.id.includes('bronze')) targetVal = 10
            else if (item.id.includes('prata')) targetVal = 50
            else if (item.id.includes('ouro')) targetVal = 100
            else if (item.id.includes('diamante')) targetVal = 500
          } else if (item.id.startsWith('a_banca')) {
            currentVal = perfectExamsCount
            if (item.id.includes('bronze')) targetVal = 1
            else if (item.id.includes('prata')) targetVal = 10
            else if (item.id.includes('ouro')) targetVal = 50
          } else if (item.id.startsWith('o_tutor')) {
            currentVal = tutorCount
            if (item.id.includes('bronze')) targetVal = 5
            else if (item.id.includes('prata')) targetVal = 50
            else if (item.id.includes('ouro')) targetVal = 200
          } else if (item.id === 'o_planejador') {
            currentVal = unlockedSet.has('o_planejador') ? 1 : 0
            targetVal = 1
          } else if (item.secret) {
            currentVal = isUnlocked ? 1 : 0
            targetVal = 1
          }

          const progressPercent = Math.min(100, Math.round((currentVal / targetVal) * 100))

          // Lógica de segredos
          const isSecretAndLocked = item.secret && !isUnlocked

          // Estilo baseado no tier
          let tierStyles = {
            border: 'border-amber-500/40',
            shadow: 'shadow-amber-500/10',
            ring: 'ring-amber-500/10',
            gradient: 'from-amber-500/10 via-orange-500/5 to-transparent',
            iconGradient: 'from-amber-500 to-orange-500',
            iconShadow: 'shadow-orange-500/30'
          }

          if (item.tier === 'prata') {
            tierStyles = {
              border: 'border-slate-300/60',
              shadow: 'shadow-slate-300/10',
              ring: 'ring-slate-300/20',
              gradient: 'from-slate-300/20 via-slate-400/5 to-transparent',
              iconGradient: 'from-slate-300 to-slate-400 text-slate-800',
              iconShadow: 'shadow-slate-400/30'
            }
          } else if (item.tier === 'ouro') {
            tierStyles = {
              border: 'border-yellow-400/60',
              shadow: 'shadow-yellow-500/20',
              ring: 'ring-yellow-400/30',
              gradient: 'from-yellow-400/20 via-amber-500/5 to-transparent',
              iconGradient: 'from-yellow-400 to-amber-500 text-amber-900',
              iconShadow: 'shadow-amber-500/40'
            }
          } else if (item.tier === 'diamante') {
            tierStyles = {
              border: 'border-cyan-400/60',
              shadow: 'shadow-cyan-400/30',
              ring: 'ring-cyan-400/50',
              gradient: 'from-cyan-400/20 via-blue-500/10 to-transparent',
              iconGradient: 'from-cyan-300 to-blue-500 text-white',
              iconShadow: 'shadow-cyan-400/50'
            }
          }

          return (
            <div 
              key={item.id}
              className={`relative overflow-hidden rounded-2xl border p-5 flex items-start gap-4 transition-all duration-300 ${
                isUnlocked 
                  ? `bg-surface ${tierStyles.border} shadow-lg ${tierStyles.shadow} ring-1 ${tierStyles.ring}` 
                  : 'bg-surface-muted/50 border-border opacity-70'
              }`}
            >
              {/* Efeito glow no fundo se estiver liberado */}
              {isUnlocked && (
                <div className={`absolute -inset-px rounded-2xl bg-gradient-to-r ${tierStyles.gradient} opacity-100 transition-opacity duration-300 pointer-events-none`} />
              )}

              {/* Ícone do Troféu */}
              <div className={`p-3 rounded-xl shrink-0 transition-colors shadow-sm relative z-10 overflow-hidden ${
                isUnlocked && !item.imageUrl
                  ? `bg-gradient-to-tr ${tierStyles.iconGradient} ${tierStyles.iconShadow}` 
                  : isUnlocked && item.imageUrl 
                  ? 'p-0 shadow-lg' 
                  : 'bg-slate-800 text-slate-500'
              }`}>
                {isSecretAndLocked ? (
                  <Lock className="size-6" />
                ) : isUnlocked ? (
                  item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.title} className="size-12 object-cover" />
                  ) : (
                    <Trophy className="size-6 animate-pulse" />
                  )
                ) : (
                  <Lock className="size-6" />
                )}
              </div>

              {/* Textos da conquista */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className={`font-bold text-sm truncate ${isUnlocked ? 'text-text-strong' : 'text-text-muted'}`}>
                    {isSecretAndLocked ? 'Conquista Oculta' : item.title}
                  </h4>
                  {isUnlocked && (
                    <span className="flex items-center gap-0.5 text-[8px] bg-emerald-500/10 text-emerald-500 font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                      <Check className="size-2" /> Liberada
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-muted mt-1 leading-snug break-words">
                  {isSecretAndLocked ? 'Continue explorando e estudando no OmniMind para descobrir este segredo.' : item.description}
                </p>

                {/* Barra de progresso para bloqueados (Secretos não mostram barra) */}
                {!isUnlocked && !isSecretAndLocked && (
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
