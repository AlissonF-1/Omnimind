import { createClient } from '@/utils/supabase/server'
import { getDailyStudyLogs } from '@/actions/stats'
import { getUserStudyStats, checkAndUnlockAchievements } from '@/actions/achievements'
import AchievementsPanel from '@/components/AchievementsPanel'
import AchievementNotifier from '@/components/AchievementNotifier'
import { Trophy, Sparkles } from 'lucide-react'
import { redirect } from 'next/navigation'
import { getMilestones } from '@/actions/milestones'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Minhas Conquistas | OmniMind',
  description: 'Acompanhe seus marcos de estudo desbloqueados e conquistas gamificadas no OmniMind.',
}

export default async function ConquistasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Busca dados de logs, conquistas e marcos em paralelo
  const [studyLogs, userStats, newlyUnlocked, milestones] = await Promise.all([
    getDailyStudyLogs(),
    getUserStudyStats(),
    checkAndUnlockAchievements(),
    getMilestones()
  ])

  // Contagem agregada de notas do usuário
  const { count: notesCount } = await supabase
    .from('notes')
    .select('id, workspaces!inner(user_id)', { count: 'exact', head: true })
    .eq('workspaces.user_id', user.id)

  const totalReviews = studyLogs?.reduce((acc: number, cur: any) => acc + (cur.review_count || 0), 0) || 0

  return (
    <div className="page-container animate-in fade-in duration-300 px-4 sm:px-6 py-4 sm:py-6" id="conquistas-page">
      <AchievementNotifier newlyUnlocked={newlyUnlocked} />
      
      <header className="mb-6 flex items-center gap-3">
        <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-xl ring-1 ring-amber-500/25">
          <Trophy className="size-6 animate-pulse" />
        </div>
        <div>
          <h1 className="page-title text-2xl sm:text-3xl font-extrabold text-text-strong animate-pulse" id="page-main-title">
            Galeria de Troféus
          </h1>
          <p className="page-subtitle text-xs text-text-muted mt-0.5">
            Seus objetivos alcançados no seu segundo cérebro
          </p>
        </div>
      </header>

      {/* 📖 LINHA DO TEMPO DO HERÓI (Crônica do Conhecimento) */}
      <section className="panel bg-gradient-to-br from-zinc-900 to-zinc-950 border-border/40 p-6 rounded-2xl shadow-sm mb-6 select-none">
        <h3 className="text-sm font-black text-amber-500 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Sparkles className="size-4 animate-spin text-amber-400" />
          Crônica do Conhecimento
        </h3>
        
        {milestones.length === 0 ? (
          <p className="text-xs text-text-muted italic py-2">
            A sua jornada ainda não registrou nenhum marco. Complete revisões e crie provas no calendário para escrever sua história!
          </p>
        ) : (
          <div className="relative border-l border-amber-500/20 ml-2.5 pl-5 space-y-4">
            {milestones.slice(0, 5).map((milestone) => (
              <div key={milestone.id} className="relative group animate-in fade-in slide-in-from-left-2 duration-300">
                {/* Indicador de Bolinha com Glow */}
                <span className="absolute -left-[26px] top-1 flex h-3 w-3 items-center justify-center rounded-full bg-zinc-900 border border-amber-500/50">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 group-hover:scale-125 transition-transform" />
                </span>
                
                {/* Conteúdo do Marco */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                    {new Date(milestone.milestone_date).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                  <p className="text-xs text-text-strong font-medium leading-relaxed">
                    {milestone.title}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <main className="bg-surface border border-border rounded-2xl p-6 shadow-sm" id="conquistas-content">
        <AchievementsPanel
          unlockedList={userStats?.unlocked_achievements || []}
          tutorCount={userStats?.tutor_queries_count || 0}
          perfectExamsCount={userStats?.perfect_exams_count || 0}
          notesCount={notesCount || 0}
          totalReviews={totalReviews}
        />
      </main>
    </div>
  )
}
