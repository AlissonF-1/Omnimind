import { BrainCircuit, FolderPlus, NotebookPen, Sparkles, CalendarDays, AlertCircle, Zap, Flame } from 'lucide-react'
import Heatmap from '@/components/Heatmap'
import DashboardStatsCards from '@/components/DashboardStatsCards'
import DashboardRelearningAlert from '@/components/DashboardRelearningAlert'
import BlindSpotsPanel from '@/components/BlindSpotsPanel'
import DailyProgressCircle from '@/components/DailyProgressCircle'
import AchievementNotifier from '@/components/AchievementNotifier'
import { getDailyStudyLogs, getUserDashboardStats, getCriticalReviewAlerts, CriticalAlert, getWeeklyLearningCycleReport } from '@/actions/stats'
import StudyInsightsPanel from '@/components/StudyInsightsPanel'
import StudyCompanion from '@/components/StudyCompanion'
import { getDynamicDailyGoal } from '@/actions/calendar'
import { getBlindSpots } from '@/actions/blindspots'
import { getUserStudyStats, checkAndUnlockAchievements, getDailyQuests, getStreakJeopardyStatus, getUserStreak } from '@/actions/achievements'
import StreakRescueModal from '@/components/StreakRescueModal'
import { getWorkspacesHealth } from '@/actions/workspaces'
import { getUserPreferences } from '@/actions/settings'
import WorkspaceHealthGrid from '@/components/WorkspaceHealthGrid'
import { createClient } from '@/utils/supabase/server'
import { Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import LevelProgressCard from '@/components/LevelProgressCard'
import DailyQuestsCard from '@/components/DailyQuestsCard'

export const dynamic = 'force-dynamic'

const steps = [
  {
    title: 'Crie um workspace',
    description: 'Separe matérias, projetos ou concursos em espaços próprios.',
    icon: FolderPlus,
  },
  {
    title: 'Escreva suas notas',
    description: 'Use Markdown para registrar conceitos, exemplos e imagens.',
    icon: NotebookPen,
  },
  {
    title: 'Gere flashcards',
    description: 'Extraia perguntas úteis a partir do conteúdo que você já escreveu.',
    icon: Sparkles,
  },
  {
    title: 'Revise no momento certo',
    description: 'FSRS agenda cada card no pico do esquecimento.',
    icon: BrainCircuit,
  },
]

function DashboardLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-24 rounded-xl bg-surface-muted" />
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-surface-muted" />
        ))}
      </div>
      <div className="h-40 rounded-xl bg-surface-muted" />
      <div className="h-48 rounded-xl bg-surface-muted" />
    </div>
  )
}

function DashboardError({ error }: { error: string }) {
  return (
    <div className="panel-muted flex flex-col items-center justify-center gap-3 py-12 text-center rounded-2xl">
      <AlertCircle className="size-10 text-error" />
      <div>
        <p className="text-sm font-medium text-text-strong">Erro ao carregar o dashboard</p>
        <p className="mt-1 text-xs text-text-muted">{error}</p>
      </div>
    </div>
  )
}

export default async function DashboardPage() {
  // 1. Blindagem de Fuso Horário (Garante o horário local correto no Servidor)
  const formatterHour = new Intl.DateTimeFormat('pt-BR', {
    hour: 'numeric',
    hour12: false,
    timeZone: 'America/Fortaleza' // Fuso horário alinhado com Teresina
  })
  const hour = parseInt(formatterHour.format(new Date()), 10)

  let greeting, iconImage

  if (hour >= 5 && hour < 12) {
    greeting = 'Bom dia'
    iconImage = '/images/greeting_sun_3d.png'
  } else if (hour >= 12 && hour < 18) {
    greeting = 'Boa tarde'
    iconImage = '/images/greeting_sun_3d.png'
  } else {
    greeting = 'Boa noite'
    iconImage = '/images/greeting_moon_3d.png'
  }

  // 2. Formatação elegante da data atual com fuso horário blindado
  const today = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Fortaleza',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date())

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const streak = user ? await getUserStreak(user.id) : 0

  return (
    <div className="page-container px-4 sm:px-6 py-4 sm:py-6">
      {/* Cabeçalho com data */}
      <header className="mb-6 border-b border-border/50 pb-4 sm:pb-5 flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-medium text-primary flex items-center gap-2">
              Painel
            </p>
            <span className="text-text-muted">•</span>
            <span className="text-xs text-text-muted font-normal capitalize">
              {today}
            </span>
          </div>
          
          <h1 className="page-title text-2xl sm:text-3xl flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center justify-between w-full sm:w-auto">
              <div className="relative size-14 sm:size-16 shrink-0 overflow-hidden rounded-full shadow-[0_0_25px_rgba(255,255,255,0.15)] border border-white/10">
                <Image src={iconImage} alt={greeting} fill className="object-cover" />
              </div>
              {/* O Golem (Study Companion) no mobile aparece aqui, ao lado da Lua */}
              <div className="block sm:hidden shrink-0 scale-90 origin-right">
                <StudyCompanion streak={streak} />
              </div>
            </div>
            <span className="leading-tight sm:leading-normal">
              {greeting} — sua memória te espera.
            </span>
          </h1>
        </div>

        {/* 🆕 O Golem (Study Companion) aparece aqui */}
        <div className="hidden sm:block shrink-0">
          <StudyCompanion streak={streak} />
        </div>
      </header>

      <Suspense fallback={<DashboardLoading />}>
        <DashboardContent />
      </Suspense>
    </div>
  )
}

async function DashboardContent() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) throw new Error('Não autenticado')

    // 1. Busca estatísticas concorrentemente em paralelo
    const [
      studyLogs,
      stats,
      criticalAlerts,
      blindSpots,
      userStats,
      newlyUnlocked,
      dailyQuests,
      dynamicGoalData,
      streakJeopardy,
      workspacesHealth,
      settings,
      weeklyAiReport
    ] = await Promise.all([
      getDailyStudyLogs(),
      getUserDashboardStats(),
      getCriticalReviewAlerts(),
      getBlindSpots(),
      getUserStudyStats(),
      checkAndUnlockAchievements(),
      getDailyQuests(),
      getDynamicDailyGoal(),
      getStreakJeopardyStatus(),
      getWorkspacesHealth(),
      getUserPreferences(),
      getWeeklyLearningCycleReport()
    ])

    const hasActivity = studyLogs && studyLogs.length > 0
    
    // 3. Blindagem contra arrays nulos quebrando o spread operator
    const topAlert = [...(criticalAlerts || [])].sort(
      (a: CriticalAlert, b: CriticalAlert) => b.criticalCount - a.criticalCount
    )[0] ?? null
    
    // 4. Blindagem para garantir que o stats existe
    const isNewUser = (stats?.totalCards || 0) === 0 && !hasActivity

    // Contagem de notas para exibir no progresso das conquistas
    const { count: notesCount } = await supabase
      .from('notes')
      .select('id, workspaces!inner(user_id)', { count: 'exact', head: true })
      .eq('workspaces.user_id', user.id)

    // Hoje e totais de revisões
    const todayStr = new Date().toISOString().split('T')[0]
    const todayLog = studyLogs?.find((log: any) => (log.study_date?.split('T')[0] || log.study_date) === todayStr)
    const todayReviewCount = todayLog?.review_count || 0
    const totalReviews = studyLogs?.reduce((acc: number, cur: any) => acc + (cur.review_count || 0), 0) || 0

    return (
      <div className="space-y-6">

        {/* Notificador de conquistas recém-adquiridas */}
        <AchievementNotifier newlyUnlocked={newlyUnlocked} />

        {topAlert && <DashboardRelearningAlert topAlert={topAlert} />}

        {/* Grid de Estatísticas e Progresso Diário (Com Animação Cascata Staggered) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <DashboardStatsCards
              totalCards={stats?.totalCards || 0}
              overdueCards={stats?.overdueCards || 0}
              streak={stats?.streak || 0}
              retentionRate={stats?.retentionRate || 0}
            />

            {hasActivity ? (
              <Heatmap logs={studyLogs} />
            ) : (
              <div className="panel-muted flex flex-col items-center justify-center gap-3 rounded-xl px-6 py-10 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                  <CalendarDays className="size-6" />
                </span>
                <div>
                  <p className="text-sm font-medium text-text-strong">
                    Sua sequência de estudos aparece aqui
                  </p>
                  <p className="mt-1 text-xs text-text-muted max-w-sm">
                    Complete sua primeira sessão de revisão para começar a construir sua sequência.
                  </p>
                </div>
              </div>
            )}
            
            <DailyQuestsCard quests={dailyQuests} />
          </div>

          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <DailyProgressCircle
              reviewCount={todayReviewCount}
              streak={stats?.streak || 0}
              multiplier={userStats?.streak_multiplier || 1.0}
              isGoalCompleted={userStats?.daily_goal_completed || false}
              dailyGoal={dynamicGoalData?.goal || settings?.daily_goal_default || 10}
              activeGoalTitle={dynamicGoalData?.activeGoal?.title}
            />
            
            <LevelProgressCard 
              totalXp={userStats?.total_xp || 0}
              currentLevel={userStats?.current_level || 1}
              streakShields={userStats?.streak_shields || 0}
              isJeopardy={streakJeopardy?.isJeopardy}
            />

            {/* ⚡ CARD DO MODO ULTIMATO (ESTÉTIKA CYBER-URGÊNCIA) */}
            <div className="relative overflow-hidden rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-950/40 via-surface/90 to-surface-muted/50 p-5 flex flex-col justify-between shadow-[0_0_20px_rgba(239,68,68,0.1)] hover:border-red-500/50 hover:shadow-[0_0_25px_rgba(239,68,68,0.2)] transition-all duration-300 group">
              {/* Efeito de brilho / scanline pulsante */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-red-500/10 to-transparent animate-pulse pointer-events-none" />

              <div className="relative z-10">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-red-400 flex items-center gap-1.5 uppercase tracking-wider">
                    <Zap className="size-3.5 animate-pulse text-red-400 fill-red-400/30" />
                    Modo Ultimato
                  </h4>
                  <span className="text-[9px] font-extrabold uppercase tracking-widest text-red-400/80 bg-red-500/10 border border-red-500/20 rounded-md px-2 py-0.5 animate-pulse">
                    Alta Urgência
                  </span>
                </div>
                <p className="text-[11px] text-text-medium mt-2.5 leading-relaxed font-medium">
                  Força bruta de véspera de provas. Estude todos os cards dos próximos 15 dias ordenados por <strong className="text-red-300 font-bold">menor estabilidade primeiro</strong> em formato Quiz rápido.
                </p>
              </div>

              <Link 
                href="/dashboard/revisoes?mode=ultimato"
                className="relative z-10 mt-5 w-full text-center py-2.5 rounded-xl bg-gradient-to-r from-red-600 via-orange-600 to-red-600 hover:from-red-500 hover:to-orange-500 text-white text-xs font-extrabold transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-[0_4px_16px_rgba(239,68,68,0.3)] group-hover:shadow-[0_6px_20px_rgba(239,68,68,0.4)]"
              >
                <Flame className="size-3.5 fill-current animate-pulse" />
                Iniciar Força Bruta
              </Link>
            </div>
          </div>
        </div>

        {/* Grid de Saúde de Retenção dos Workspaces */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <WorkspaceHealthGrid healths={workspacesHealth} />
        </div>

        {/* 🧠 Insights do Cérebro (Horário de Ouro & Relatório de Ciclo IA) */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <StudyInsightsPanel logs={studyLogs || []} aiReport={weeklyAiReport?.report || ''} />
        </div>

        {/* Nossa nova feature acionável */}
        {blindSpots && blindSpots.length > 0 && (
          <BlindSpotsPanel blindSpots={blindSpots} />
        )}

        {isNewUser && (
          <section>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Como começar
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {steps.map((step, index) => {
                const Icon = step.icon
                return (
                  <article
                    key={step.title}
                    className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 hover:border-primary/20 transition-colors"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary mt-0.5">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-sm font-semibold text-text-strong">{step.title}</h2>
                        <span className="text-[10px] font-medium text-text-muted tabular-nums">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                      </div>
                      <p className="text-xs leading-5 text-text-medium">{step.description}</p>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )}
        
        {/* Modal de Resgate de Streak se estiver em perigo */}
        <StreakRescueModal
          isJeopardy={!!streakJeopardy?.isJeopardy}
          potentialStreak={streakJeopardy?.potentialStreak || 0}
        />

      </div>
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Falha ao carregar os dados.'
    return <DashboardError error={message} />
  }
}