import { CheckCircle2, Flame, ListChecks, MessageSquare, NotebookPen } from 'lucide-react'

interface Quest {
  id: string
  quest_id: string
  progress: number
  target: number
  completed: boolean
  reward_xp: number
}

const questLabels = {
  guerreiro: { label: 'Revisar cards', icon: Flame },
  escritor: { label: 'Registrar uma nota', icon: NotebookPen },
  curioso: { label: 'Perguntar ao tutor', icon: MessageSquare },
}

export default function DailyQuestsCard({ quests }: { quests: Quest[] }) {
  const uniqueQuests = [...new Map(quests.map((quest) => [quest.quest_id, quest])).values()]

  return (
    <article className="dh-panel dh-pad">
      <div className="dh-row dh-between">
        <h3 className="dh-title">Missões de hoje</h3>
        <ListChecks size={18} className="dh-accent" aria-hidden="true" />
      </div>
      {uniqueQuests.length === 0 ? (
        <p className="dh-caption mt-2">Nenhuma missão disponível hoje.</p>
      ) : (
        <ul className="mt-3 list-none p-0">
          {uniqueQuests.map((quest) => {
            const info = Object.hasOwn(questLabels, quest.quest_id) ? questLabels[quest.quest_id as keyof typeof questLabels] : undefined
            const Icon = info?.icon ?? ListChecks
            const label = info?.label ?? quest.quest_id
            return (
              <li className="dh-quest" key={quest.id}>
                <div className="dh-row dh-between">
                  <span className="dh-row min-w-0 text-xs font-semibold">
                    <span className={'dh-icon' + (quest.completed ? ' dh-positive' : '')}>
                      {quest.completed ? <CheckCircle2 size={15} aria-hidden="true" /> : <Icon size={15} aria-hidden="true" />}
                    </span>
                    {label}
                  </span>
                  <span className={'text-xs tabular-nums ' + (quest.completed ? 'dh-positive' : 'dh-caption')}>
                    {quest.completed ? 'Concluída · ' : quest.progress + '/' + quest.target + ' · '}+{quest.reward_xp} XP
                  </span>
                </div>
                {quest.target > 0 && (
                  <progress className={'dh-progress mt-2' + (quest.completed ? ' dh-positive' : '')}
                    value={Math.min(quest.progress, quest.target)} max={quest.target} aria-label={label}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </article>
  )
}
