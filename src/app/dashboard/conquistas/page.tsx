import { createClient } from '@/utils/supabase/server'
import { getDailyStudyLogs } from '@/actions/stats'
import { getUserStudyStats, checkAndUnlockAchievements } from '@/actions/achievements'
import AchievementsPanel from '@/components/AchievementsPanel'
import AchievementNotifier from '@/components/AchievementNotifier'
import { Trophy, Sparkles } from 'lucide-react'
import { redirect } from 'next/navigation'
import { getMilestones } from '@/actions/milestones'

import CronicaDoConhecimento from '@/components/CronicaDoConhecimento'

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

      {/* 📖 LINHA DO TEMPO DO HERÓI (Crônica do Conhecimento Escalável) */}
      <CronicaDoConhecimento initialMilestones={milestones} />

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
