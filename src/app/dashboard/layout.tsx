import { getWorkspaces } from '@/actions/workspaces'
import { getUserStudyStats } from '@/actions/achievements'
import { getUserDashboardStats } from '@/actions/stats'
import { getUserPreferences } from '@/actions/settings'
import { createClient } from '@/utils/supabase/server'
import DashboardShell from '@/components/DashboardShell'
import { SettingsProvider } from '@/contexts/SettingsContext'
import { DEFAULT_PREFERENCES, type UserPreferences } from '@/types/settings'
import type { User } from '@supabase/supabase-js'
import './shell.css'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Fetches com fallback defensivo — nenhum erro aqui pode derrubar o layout inteiro
  let workspaces: NonNullable<Awaited<ReturnType<typeof getWorkspaces>>> = []
  let userStats: Awaited<ReturnType<typeof getUserStudyStats>> = null
  let dashStats: Awaited<ReturnType<typeof getUserDashboardStats>> | null = null
  let settings: UserPreferences = { ...DEFAULT_PREFERENCES, user_id: 'default' }
  let user: User | null = null

  try {
    const supabase = await createClient()
    const { data: { user: u } } = await supabase.auth.getUser()
    user = u
  } catch (e) {
    console.error('[layout] Erro ao buscar usuário:', e)
  }

  try {
    const results = await Promise.allSettled([
      getWorkspaces(),
      getUserStudyStats(),
      getUserDashboardStats(),
      getUserPreferences(),
    ])
    if (results[0].status === 'fulfilled') workspaces = results[0].value ?? []
    if (results[1].status === 'fulfilled') userStats = results[1].value
    if (results[2].status === 'fulfilled') dashStats = results[2].value
    if (results[3].status === 'fulfilled') settings = results[3].value
  } catch (e) {
    console.error('[layout] Erro nos fetches paralelos:', e)
  }

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuário'
  const avatarUrl = user?.user_metadata?.avatar_url || null
  const avatarIcon = user?.user_metadata?.avatar_icon || null
  const currentLevel = userStats?.current_level || 1
  const overdueCards = dashStats?.overdueCards || 0

  return (
    <SettingsProvider key={user?.id} initialSettings={settings}>
      <DashboardShell
        workspaces={workspaces}
        accountId={user?.id ?? null}
        userName={userName}
        avatarUrl={avatarUrl}
        avatarIcon={avatarIcon}
        currentLevel={currentLevel}
        totalXp={userStats?.total_xp ?? 0}
        overdueCards={overdueCards}
      >
        {children}
      </DashboardShell>
    </SettingsProvider>
  )
}
