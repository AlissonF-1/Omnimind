'use client'

import { Flame, NotebookPen, MessageSquare, CheckCircle2 } from 'lucide-react'

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

  // Deduplicação preventiva no componente cliente
  const uniqueQuests = Array.from(
    new Map(quests.map(q => [q.quest_id, q])).values()
  )

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-surface via-surface/90 to-surface-muted/40 p-5 shadow-[0_4px_20px_rgba(0,0,0,0.15)] flex flex-col gap-4 hover:border-primary/30 transition-all duration-300">
      <div>
        <span className="block text-[10px] font-extrabold text-text-muted uppercase tracking-wider mb-1">
          Missões de Hoje
        </span>
        <h3 className="font-extrabold text-base text-text-strong tracking-wide">
          Objetivos Diários
        </h3>
      </div>

      <div className="flex flex-col gap-3">
        {uniqueQuests.map((quest) => {
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
              className={`border rounded-xl p-3.5 transition-all duration-300 flex flex-col gap-2 relative overflow-hidden group ${
                quest.completed 
                  ? 'border-emerald-500/40 bg-emerald-500/10 shadow-[0_0_15px_rgba(34,197,94,0.12)]' 
                  : 'border-border/50 bg-surface/60 hover:border-primary/30 hover:bg-surface-muted/30'
              }`}
            >
              <div className="flex items-center justify-between gap-3 z-10 relative">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg border transition-transform group-hover:scale-110 ${
                    quest.completed ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : `${info.bgClass} ${info.iconColor}`
                  }`}>
                    <Icon className="size-4" />
                  </span>
                  <span className={`text-xs font-bold leading-tight ${quest.completed ? 'text-emerald-400 line-through opacity-80' : 'text-text-strong'}`}>
                    {info.title}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {quest.completed ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-400 bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-0.5 rounded-full shadow-sm animate-in zoom-in-75 duration-300">
                      <CheckCircle2 className="size-3 text-emerald-400" /> Pronto (+{quest.reward_xp} XP)
                    </span>
                  ) : (
                    <span className="text-[10px] font-extrabold text-text-muted">
                      {quest.progress} / {quest.target} (+{quest.reward_xp} XP)
                    </span>
                  )}
                </div>
              </div>

              {/* Barra de Progresso da Quest */}
              <div className="w-full h-1.5 rounded-full bg-border/40 overflow-hidden relative z-10">
                <div 
                  className={`h-full rounded-full transition-all duration-700 ease-out ${
                    quest.completed ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-gradient-to-r from-primary to-orange-400'
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

