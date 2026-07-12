'use client'

import { Flame, NotebookPen, MessageSquare } from 'lucide-react'

interface Quest {
  id: string
  quest_id: string
  progress: number
  target: number
  completed: boolean
  reward_xp: number
}

interface DailyQuestsCardProps {
  quests: Quest[]
}

export default function DailyQuestsCard({ quests }: DailyQuestsCardProps) {
  // Mapeamento das informações visuais de cada quest
  const QUEST_INFO: Record<string, { title: string; icon: any; iconColor: string; bgClass: string }> = {
    guerreiro: {
      title: '🔥 Guerreiro do Dia (Revisar 10 cards)',
      icon: Flame,
      iconColor: 'text-orange-500',
      bgClass: 'bg-orange-500/10 border-orange-500/20'
    },
    escritor: {
      title: '📝 Escritor (Criar 1 nota)',
      icon: NotebookPen,
      iconColor: 'text-primary',
      bgClass: 'bg-primary/10 border-primary/20'
    },
    curioso: {
      title: '🧠 Curioso (Fazer 1 pergunta no Chat)',
      icon: MessageSquare,
      iconColor: 'text-indigo-500',
      bgClass: 'bg-indigo-500/10 border-indigo-500/20'
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-sm flex flex-col gap-4">
      <div>
        <span className="block text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">
          Missões de Hoje
        </span>
        <h3 className="font-extrabold text-base text-text-strong tracking-wide">
          Objetivos Diários
        </h3>
      </div>

      <div className="flex flex-col gap-3">
        {quests.map((quest) => {
          const info = QUEST_INFO[quest.quest_id] || {
            title: quest.quest_id,
            icon: Flame,
            iconColor: 'text-text-muted',
            bgClass: 'bg-surface-muted border-border'
          }
          const Icon = info.icon
          const percent = Math.min(100, Math.round((quest.progress / quest.target) * 100))

          return (
            <div 
              key={quest.id} 
              className={`border rounded-xl p-3.5 transition-all flex flex-col gap-2 relative overflow-hidden ${
                quest.completed 
                  ? 'border-emerald-500/20 bg-emerald-500/5' 
                  : 'border-border/40 bg-surface'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg border ${
                    quest.completed ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : `${info.bgClass} ${info.iconColor}`
                  }`}>
                    <Icon className="size-4" />
                  </span>
                  <span className={`text-xs font-bold leading-tight ${quest.completed ? 'text-emerald-500 dark:text-emerald-400' : 'text-text-strong'}`}>
                    {info.title}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {quest.completed ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      ✓ Pronto (+{quest.reward_xp} XP)
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-text-muted">
                      {quest.progress} / {quest.target} (+{quest.reward_xp} XP)
                    </span>
                  )}
                </div>
              </div>

              {/* Barra de Progresso da Quest */}
              <div className="w-full h-1.5 rounded-full bg-border/40 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ease-out ${
                    quest.completed ? 'bg-emerald-500' : 'bg-primary'
                  }`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
