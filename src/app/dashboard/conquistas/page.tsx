import { redirect } from 'next/navigation'
import { getDailyStudyLogs } from '@/actions/stats'
import { checkAndUnlockAchievements, getUserStreak, getUserStudyStats } from '@/actions/achievements'
import { getMilestones } from '@/actions/milestones'
import { getWorkspaces } from '@/actions/workspaces'
import AchievementsPanel from '@/components/AchievementsPanel'
import CronicaDoConhecimento from '@/components/CronicaDoConhecimento'
import { createClient } from '@/utils/supabase/server'
import DashboardAchievements from '../DashboardAchievements'
import { buildCollection } from './collection'
import './achievements.css'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Minhas Conquistas | OmniMind',
  description: 'Acompanhe seus troféus e marcos de estudo no OmniMind.',
}

async function checkGalleryAchievements() {
  'use server'

  return checkAndUnlockAchievements()
}

export default async function ConquistasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [studyLogs, userStats, streak, milestones, notes, exams] = await Promise.all([
    getDailyStudyLogs(),
    getUserStudyStats(),
    getUserStreak(user.id),
    getMilestones(),
    supabase.from('notes').select('id, workspaces!inner(user_id)', { count: 'exact', head: true }).eq('workspaces.user_id', user.id),
    supabase.from('exam_goals').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
  ])

  const collection = userStats ? buildCollection(userStats.unlocked_achievements ?? [], {
    reviews: studyLogs?.reduce((total, log) => total + (log.review_count ?? 0), 0) ?? null,
    streak,
    exams: exams.count,
    notes: notes.count,
    simulations: userStats.perfect_exams_count ?? null,
    tutor: userStats.tutor_queries_count ?? null,
  }) : null

  const workspace = collection?.next?.progress.key === 'notes'
    ? (await getWorkspaces())?.find((item) => !item.is_archived)
    : undefined

  return (
    <div className="achievement-gallery">
      {collection ? (
        <>
          <DashboardAchievements checkAction={checkGalleryAchievements} />
          <AchievementsPanel collection={collection} workspaceId={workspace?.id} />
        </>
      ) : (
        <section className="ag-surface ag-empty">
          <h1>Minhas conquistas</h1>
          <p role="status">Não foi possível carregar sua coleção.</p>
          <form action="/dashboard/conquistas" method="get">
            <button type="submit" className="ag-button">Tentar novamente</button>
          </form>
        </section>
      )}
      <CronicaDoConhecimento initialMilestones={milestones} />
    </div>
  )
}
