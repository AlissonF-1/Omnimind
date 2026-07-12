import { getWorkspaces } from '@/actions/workspaces'
import { getUserStudyStats } from '@/actions/achievements'
import { getUserDashboardStats } from '@/actions/stats'
import { createClient } from '@/utils/supabase/server'
import AchievementToast from '@/components/AchievementToast'
import LevelUpModal from '@/components/LevelUpModal'
import DashboardShell from '@/components/DashboardShell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [workspaces, userStats, dashStats] = await Promise.all([
    getWorkspaces(),
    getUserStudyStats(),
    getUserDashboardStats()
  ])

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuário'
  const avatarUrl = user?.user_metadata?.avatar_url || null
  const currentLevel = userStats?.current_level || 1
  const overdueCards = dashStats?.overdueCards || 0

  return (
    <DashboardShell
      workspaces={workspaces}
      userName={userName}
      avatarUrl={avatarUrl}
      currentLevel={currentLevel}
      overdueCards={overdueCards}
    >
      {children}
    </DashboardShell>
  )
}
