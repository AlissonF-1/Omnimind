import { Suspense } from 'react'
import { AlertCircle } from '@/components/icons'
import Heatmap from '@/components/Heatmap'
import DashboardStatsCards from '@/components/DashboardStatsCards'
import DashboardRelearningAlert from '@/components/DashboardRelearningAlert'
import BlindSpotsPanel from '@/components/BlindSpotsPanel'
import DailyProgressCircle from '@/components/DailyProgressCircle'
import StudyInsightsPanel from '@/components/StudyInsightsPanel'
import StreakRescueModal from '@/components/StreakRescueModal'
import WorkspaceHealthGrid from '@/components/WorkspaceHealthGrid'
import LevelProgressCard from '@/components/LevelProgressCard'
import DailyQuestsCard from '@/components/DailyQuestsCard'
import { DashboardCompanion, DashboardEmptyActivity, DashboardHero, DashboardReviewFocus } from '@/components/DashboardOverview'
import DashboardStudyRhythm from '@/components/DashboardStudyRhythm'
import { getDailyStudyLogs, getUserDashboardStats, getCriticalReviewAlerts, getWeeklyLearningCycleReport } from '@/actions/stats'
import { getDynamicDailyGoal } from '@/actions/calendar'
import { getBlindSpots } from '@/actions/blindspots'
import { getUserStudyStats, checkAndUnlockAchievements, getDailyQuests, getStreakJeopardyStatus, getUserStreak } from '@/actions/achievements'
import { getWorkspacesHealth } from '@/actions/workspaces'
import { getUserPreferences } from '@/actions/settings'
import { createClient } from '@/utils/supabase/server'
import { profileWeek } from '@/lib/profile'
import DashboardAchievements from './DashboardAchievements'
import './home.css'

export const dynamic = 'force-dynamic'

const timeZone = 'America/Sao_Paulo'
const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
})
const hourFormat = new Intl.DateTimeFormat('pt-BR', { timeZone, hour: 'numeric', hour12: false })

function DashboardLoading() {
  return (
    <div className="dh-body dh-area" role="status">
      <span className="sr-only">Carregando painel…</span>
      <div className="dh-focus-grid motion-safe:animate-pulse" aria-hidden="true">
        <div className="dh-panel dh-skeleton" />
        <div className="dh-panel dh-skeleton" />
      </div>
    </div>
  )
}

function DashboardError() {
  return (
    <div className="dh-body dh-panel dh-pad text-center">
      <AlertCircle className="dh-danger mx-auto mb-2" size={24} aria-hidden="true" />
      <h2 className="dh-title">Não foi possível carregar o painel</h2>
      <p className="dh-caption mt-2">Confira a conexão e tente novamente.</p>
      <form action="/dashboard" method="get" className="mt-3">
        <button type="submit" className="dh-button dh-button-primary">Tentar novamente</button>
      </form>
    </div>
  )
}

async function checkDashboardAchievements() {
  'use server'

  return checkAndUnlockAchievements()
}

export default async function DashboardPage() {
  const now = new Date()
  const hour = Number(hourFormat.format(now))
  const greeting = hour >= 5 && hour < 12 ? 'Bom dia' : hour >= 12 && hour < 18 ? 'Boa tarde' : 'Boa noite'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const streak = user ? await getUserStreak(user.id) : 0

  return (
    <div className="dashboard-home">
      <div className="dh-area">
        <DashboardHero greeting={greeting} date={dateFormat.format(now)} />
      </div>
      <Suspense fallback={<DashboardLoading />}>
        <DashboardContent authenticated={!!user} today={now.toISOString().slice(0, 10)} streak={streak} />
      </Suspense>
    </div>
  )
}

async function DashboardContent({ authenticated, today, streak }: { authenticated: boolean; today: string; streak: number }) {
  if (!authenticated) return <DashboardError />

  const data = await Promise.all([
    getDailyStudyLogs(),
    getUserDashboardStats(),
    getCriticalReviewAlerts(),
    getBlindSpots(),
    getUserStudyStats(),
    getDailyQuests(),
    getDynamicDailyGoal(),
    getStreakJeopardyStatus(),
    getWorkspacesHealth(),
    getUserPreferences(),
    getWeeklyLearningCycleReport(),
  ]).catch((error: unknown) => {
    console.error('[dashboard] Falha ao carregar o painel:', error instanceof Error ? error.name : typeof error)
    return null
  })

  if (!data) return <DashboardError />

  const [
    studyLogs, stats, criticalAlerts, blindSpots, userStats, dailyQuests,
    dynamicGoalData, streakJeopardy, workspacesHealth, settings, weeklyAiReport,
  ] = data
  const logs = studyLogs ?? []
  const topAlert = [...(criticalAlerts ?? [])].sort((a, b) => b.criticalCount - a.criticalCount)[0]
  const todayReviewCount = logs.find((log) => log.study_date?.split('T')[0] === today)?.review_count ?? 0
  const totalCards = stats?.totalCards ?? 0
  const hasActivity = logs.some((log) => log.review_count > 0)
  const week = profileWeek(logs, new Date(today + 'T00:00:00Z'))
  const weeklyReviews = week.reduce((sum, day) => sum + day.reviews, 0)

  return (
    <>
      <DashboardAchievements checkAction={checkDashboardAchievements} />
      <div className="dh-body dh-area dh-stack">
        {topAlert && <DashboardRelearningAlert topAlert={topAlert} />}

        <DashboardStatsCards totalCards={totalCards} streak={stats?.streak ?? 0} retentionRate={stats?.retentionRate ?? 0} weeklyReviews={weeklyReviews} />

        <section className="dh-today" aria-labelledby="dashboard-today">
          <h2 id="dashboard-today" className="sr-only">Seu estudo hoje</h2>
          <div className="dh-focus-grid">
            <DashboardReviewFocus overdueCards={stats?.overdueCards ?? 0} totalCards={totalCards} />
            <DailyProgressCircle
              reviewCount={todayReviewCount}
              multiplier={userStats?.streak_multiplier || 1}
              dailyGoal={dynamicGoalData?.goal || settings?.daily_goal_default || 10}
              activeGoalTitle={dynamicGoalData?.activeGoal?.title}
            />
            <LevelProgressCard
              totalXp={userStats?.total_xp ?? 0}
              currentLevel={userStats?.current_level || 1}
              streakShields={userStats?.streak_shields ?? 0}
              isJeopardy={streakJeopardy?.isJeopardy}
            />
          </div>
        </section>

        <div className="dh-rhythm-grid">
          <DashboardStudyRhythm days={week} />
          <DailyQuestsCard quests={dailyQuests} />
        </div>
        <StudyInsightsPanel logs={logs} aiReport={weeklyAiReport?.report ?? ''} />
        <div className="dh-history-grid">
          {hasActivity ? <Heatmap logs={logs} today={today} /> : <DashboardEmptyActivity showOnboarding={totalCards === 0} />}
          <DashboardCompanion streak={streak} />
        </div>
        <WorkspaceHealthGrid healths={workspacesHealth} />
        {blindSpots && blindSpots.length > 0 && <BlindSpotsPanel blindSpots={blindSpots} />}
      </div>
      <StreakRescueModal isJeopardy={!!streakJeopardy?.isJeopardy} potentialStreak={streakJeopardy?.potentialStreak ?? 0} />
    </>
  )
}
