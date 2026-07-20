'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Shield, Sparkles, RefreshCw, Edit3, Check, X, Trophy, Loader2, AlertCircle } from 'lucide-react'
import { generatePlayerTitle, updatePlayerAvatar } from '@/actions/achievements'
import { AVATAR_ICONS } from '@/utils/avatars'
import { ACHIEVEMENTS } from '@/types/achievements'
import StudyCompanion from '@/components/StudyCompanion'
import Link from 'next/link'
import Image from 'next/image'

interface ProfileData {
  user: {
    name: string
    email: string | undefined
    avatarUrl: string | null
    avatarIcon: string | null
    playerTitle: string
  }
  totalXp: number
  currentLevel: number
  streakShields: number
  streak: number
  maxStreak: number
  cardsReviewed: number
  notesCreated: number
  perfectExams: number
  unlockedAchievements: string[]
  recentActivity: { date: string; reviews: number }[]
}

export default function ProfilePanel({ initialData }: { initialData: ProfileData }) {
  const [data, setData] = useState<ProfileData>(initialData)
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false)
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false)
  const [savingAvatarKey, setSavingAvatarKey] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)

  // Calcular progresso do nível atual
  const currentLevel = data.currentLevel
  const totalXp = data.totalXp
  const xpForCurrentLevel = Math.pow(currentLevel - 1, 2) * 5
  const xpForNextLevel = Math.pow(currentLevel, 2) * 5
  const range = xpForNextLevel - xpForCurrentLevel
  const progress = totalXp - xpForCurrentLevel
  const percent = Math.min(Math.max((progress / range) * 100, 0), 100)

  // Borda evolutiva estática sem animate-pulse contínuo (evita GPU repaints pesados)
  const avatarRingClass = useMemo(() => {
    if (currentLevel <= 5) return 'ring-4 ring-slate-300 dark:ring-slate-700'
    if (currentLevel <= 15) return 'ring-4 ring-primary shadow-[0_0_20px_rgba(99,102,241,0.5)]'
    return 'ring-4 ring-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.6)]'
  }, [currentLevel])

  // Componente de ícone do avatar resolvido diretamente (sem IIFE no JSX)
  const UserAvatarIconComponent = useMemo(() => {
    if (!data.user.avatarIcon) return null
    return AVATAR_ICONS[data.user.avatarIcon as keyof typeof AVATAR_ICONS] || null
  }, [data.user.avatarIcon])

  // Pegar as iniciais do nome
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  }

  // Acessibilidade do Modal de Avatar: Lock de Scroll no body e fecho via tecla 'Esc'
  useEffect(() => {
    if (!isAvatarModalOpen) return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsAvatarModalOpen(false)
        setAvatarError(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isAvatarModalOpen])

  // Geração de título por IA
  const handleRegenerateTitle = async () => {
    if (isGeneratingTitle) return
    setIsGeneratingTitle(true)
    try {
      const newTitle = await generatePlayerTitle(true)
      setData((prev) => ({
        ...prev,
        user: { ...prev.user, playerTitle: newTitle }
      }))
    } catch (err) {
      console.error('Erro ao gerar título:', err)
    } finally {
      setIsGeneratingTitle(false)
    }
  }

  // Salvar novo avatar com feedback visual e tratamento de erro
  const handleSelectAvatar = async (key: string) => {
    setSavingAvatarKey(key)
    setAvatarError(null)
    try {
      await updatePlayerAvatar(key)
      setData((prev) => ({
        ...prev,
        user: { ...prev.user, avatarIcon: key }
      }))
      setIsAvatarModalOpen(false)
    } catch (err) {
      console.error('Erro ao salvar avatar:', err)
      setAvatarError('Não foi possível salvar o avatar. Tente novamente.')
    } finally {
      setSavingAvatarKey(null)
    }
  }

  // Atividade máxima recente para escala do gráfico de barras
  const maxReviews = Math.max(...data.recentActivity.map((d) => d.reviews), 1)

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      
      {/* 1. Header (Identidade, Nível e XP) */}
      <div className="panel p-5 sm:p-8 flex flex-row items-center gap-4 sm:gap-8 relative overflow-hidden bg-cover bg-center" style={{ backgroundImage: 'url("/images/profile_banner.jpg")' }}>
        {/* Overlay escuro para leitura do texto */}
        <div className="absolute inset-0 z-0 bg-slate-900/70" />
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-slate-950 via-slate-900/80 to-transparent" />

        {/* Avatar com moldura evolutiva estática (sem repaints contínuos) */}
        <div className="relative z-10 shrink-0 size-20 sm:size-28">
          <div className={`absolute inset-0 rounded-full transition-all duration-300 ${avatarRingClass}`} />

          {/* Imagem ou Iniciais ou Ícone Escolhido */}
          <div className="size-full rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
            {data.user.avatarUrl ? (
              <img
                src={data.user.avatarUrl}
                alt={data.user.name}
                className="size-full rounded-full object-cover"
              />
            ) : UserAvatarIconComponent ? (
              <UserAvatarIconComponent className="size-8 sm:size-12 text-primary" />
            ) : (
              <span className="text-2xl sm:text-4xl font-black text-text-strong tracking-tight">
                {getInitials(data.user.name)}
              </span>
            )}
          </div>
          
          <button 
            type="button"
            onClick={() => {
              setAvatarError(null)
              setIsAvatarModalOpen(true)
            }}
            className="absolute -bottom-1 -right-1 bg-surface border border-border rounded-full p-1.5 shadow-sm text-text-muted hover:text-primary transition-colors z-20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            title="Editar Avatar"
            aria-label="Editar Avatar do Perfil"
          >
            <Edit3 className="size-3.5 sm:size-4" />
          </button>
        </div>

        {/* Informações textuais */}
        <div className="flex-1 min-w-0 space-y-2 sm:space-y-4 z-10 relative">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg sm:text-2xl font-black text-text-strong tracking-tight truncate max-w-[150px] sm:max-w-none">
                {data.user.name}
              </h2>
              <span className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-bold text-white bg-gradient-to-r from-indigo-500 to-primary px-2 sm:px-2.5 py-0.5 rounded-full shadow-sm select-none">
                ⭐ Lvl {currentLevel}
              </span>
            </div>
            
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-primary">
              <span className="truncate">🏆 {data.user.playerTitle}</span>
              <button 
                type="button"
                onClick={handleRegenerateTitle}
                disabled={isGeneratingTitle}
                aria-label="Gerar novo título honorífico por IA"
                className="p-1 rounded-md text-text-muted hover:text-primary hover:bg-surface-muted transition-all shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                title="Novo Título IA"
              >
                <RefreshCw className={`size-3.5 ${isGeneratingTitle ? 'animate-spin text-primary' : ''}`} />
              </button>
            </div>
          </div>

          {/* Barra de Progresso do Nível */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] font-bold text-text-muted">
              <span>XP Total: {totalXp}</span>
              <span>{Math.round(progress)} / {range} XP</span>
            </div>
            <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden p-0.5 border border-slate-700/50">
              <div 
                className="bg-gradient-to-r from-indigo-500 via-primary to-emerald-400 h-full rounded-full transition-all duration-500 shadow-sm"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Grid de Estatísticas Principais */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        
        {/* Streak Atual */}
        <div className="panel p-4 flex flex-col justify-between gap-3 relative overflow-hidden group hover:border-amber-500/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Streak</span>
            <div className="size-8 sm:size-10 shrink-0 relative drop-shadow-md transition-transform group-hover:scale-110 -mt-1 -mr-1">
              <Image src="/images/stat_streak_3d.png" alt="Streak" fill className="object-contain" />
            </div>
          </div>
          <div>
            <h4 className="text-2xl sm:text-3xl font-black text-amber-500 tracking-tight">{data.streak} <span className="text-sm font-semibold">dias</span></h4>
            <p className="text-[10px] font-medium text-text-muted">Recorde: {data.maxStreak} dias</p>
          </div>
        </div>

        {/* Cards Revisados */}
        <div className="panel p-4 flex flex-col justify-between gap-3 relative overflow-hidden group hover:border-primary/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Revisões</span>
            <div className="size-8 sm:size-10 shrink-0 relative drop-shadow-md transition-transform group-hover:scale-110 -mt-1 -mr-1">
              <Image src="/images/profile_revisoes_3d.png" alt="Revisões" fill className="object-contain" />
            </div>
          </div>
          <div>
            <h4 className="text-2xl sm:text-3xl font-black text-text-strong tracking-tight">{data.cardsReviewed}</h4>
            <p className="text-[10px] font-medium text-text-muted">Flashcards revisados</p>
          </div>
        </div>

        {/* Notas Criadas */}
        <div className="panel p-4 flex flex-col justify-between gap-3 relative overflow-hidden group hover:border-emerald-500/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Notas</span>
            <div className="size-8 sm:size-10 shrink-0 relative drop-shadow-md transition-transform group-hover:scale-110 -mt-1 -mr-1">
              <Image src="/images/profile_notas_3d.png" alt="Notas" fill className="object-contain" />
            </div>
          </div>
          <div>
            <h4 className="text-2xl sm:text-3xl font-black text-text-strong tracking-tight">{data.notesCreated}</h4>
            <p className="text-[10px] font-medium text-text-muted">Cadernos criados</p>
          </div>
        </div>

        {/* Gabaritadas */}
        <div className="panel p-4 flex flex-col justify-between gap-3 relative overflow-hidden group hover:border-indigo-500/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Provas 100%</span>
            <div className="size-8 sm:size-10 shrink-0 relative drop-shadow-md transition-transform group-hover:scale-110 -mt-1 -mr-1">
              <Image src="/images/profile_gabaritadas_3d.png" alt="Gabaritadas" fill className="object-contain" />
            </div>
          </div>
          <div>
            <h4 className="text-2xl sm:text-3xl font-black text-text-strong tracking-tight">{data.perfectExams}</h4>
            <p className="text-[10px] font-medium text-text-muted">Simulados perfeitos</p>
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* 3. Galeria de Conquistas (Resumo de Troféus) */}
        <div className="panel p-5 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-extrabold text-base text-text-strong tracking-wide">
                Conquistas
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                {data.unlockedAchievements.filter(id => ACHIEVEMENTS[id]).length} de {Object.keys(ACHIEVEMENTS).length} desbloqueados
              </p>
            </div>
            <Link href="/dashboard/conquistas" className="text-xs font-bold text-primary hover:underline">
              Ver todas
            </Link>
          </div>

          <div className="flex flex-col gap-2.5">
            {data.unlockedAchievements.length === 0 ? (
              <p className="text-sm text-text-muted py-6 text-center">Nenhum troféu conquistado ainda. Continue estudando!</p>
            ) : (
              data.unlockedAchievements
                .map((id) => ACHIEVEMENTS[id])
                .filter(Boolean)
                .slice(0, 4)
                .map((details) => {
                  let badgeColors = 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                  if (details.tier === 'prata') badgeColors = 'bg-slate-300/20 text-slate-400 border-slate-300/30'
                  if (details.tier === 'ouro') badgeColors = 'bg-yellow-400/20 text-yellow-500 border-yellow-400/30'
                  if (details.tier === 'diamante') badgeColors = 'bg-cyan-400/20 text-cyan-400 border-cyan-400/30'

                  return (
                    <div key={details.id} className="flex items-center gap-3 p-2.5 border border-border/40 rounded-xl hover:bg-surface-muted/50 transition-colors">
                      <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg border ${badgeColors}`}>
                        <Trophy className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-text-strong truncate">{details.title}</h4>
                        <p className="text-[10px] text-text-muted truncate">{details.description}</p>
                      </div>
                    </div>
                  )
                })
            )}
          </div>
        </div>

        {/* 4. Resumo da Jornada Recente (Gráfico Acessível com ARIA) */}
        <div className="panel p-5 md:col-span-2 flex flex-col gap-4" role="region" aria-label="Gráfico de atividade recente nos últimos 7 dias">
          <div>
            <h3 className="font-extrabold text-base text-text-strong tracking-wide">
              Atividade Semanal
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              Quantidade de flashcards revisados por dia nos últimos 7 dias.
            </p>
          </div>

          <div className="flex-1 flex items-end justify-between gap-2.5 h-44 px-2 pt-4 relative">
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none select-none py-1">
              <div className="border-b border-border/20 w-full h-0" />
              <div className="border-b border-border/20 w-full h-0" />
              <div className="border-b border-border/20 w-full h-0" />
              <div className="border-b border-border/20 w-full h-0" />
            </div>

            {data.recentActivity.map((day, idx) => {
              const hPercent = (day.reviews / maxReviews) * 85
              const formattedDayName = day.date.split(',')[0]
              
              return (
                <div 
                  key={idx} 
                  className="flex-1 flex flex-col items-center justify-end gap-2 h-full group z-10 relative"
                  role="img"
                  aria-label={`${formattedDayName}: ${day.reviews} cards revisados`}
                >
                  <span className="absolute -top-6 text-[10px] font-extrabold text-white bg-slate-900 px-2 py-0.5 rounded shadow opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none select-none">
                    {day.reviews} cards
                  </span>
                  
                  <div 
                    className="w-full sm:w-10 rounded-t-lg bg-gradient-to-t from-primary/80 to-primary shadow-[0_4px_12px_rgba(99,102,241,0.2)] group-hover:from-indigo-500 group-hover:to-primary transition-all duration-300 cursor-pointer min-h-[4px]"
                    style={{ height: `${Math.max(hPercent, 3)}%` }}
                  />

                  <span className="text-[10px] font-bold text-text-muted capitalize">
                    {formattedDayName}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

      </div>

      {/* Streak Shield Status Extra */}
      <div className="panel p-4 sm:p-5 flex flex-col gap-3 border-border">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex size-12 sm:size-14 shrink-0 items-center justify-center">
              <Image src="/images/streak_shield_3d.png" alt="Escudo de Streak" width={56} height={56} className="object-contain drop-shadow-lg" />
            </span>
            <h4 className="text-sm font-bold text-text-strong leading-tight">Escudo de Streak</h4>
          </div>
          <span className={`shrink-0 text-[10px] sm:text-xs font-extrabold px-2.5 py-1 rounded-full ${
            data.streakShields > 0 
              ? 'bg-primary-soft text-primary border border-primary/20' 
              : 'bg-surface-muted text-text-muted border border-border/40'
          }`}>
            {data.streakShields} ativo{data.streakShields !== 1 ? 's' : ''}
          </span>
        </div>
        <p className="text-xs text-text-muted leading-relaxed sm:pl-[4.25rem]">
          O escudo protege seu combo caso você esqueça de estudar por um dia.
        </p>
      </div>

      {/* Modal de Edição de Avatar Acessível */}
      {isAvatarModalOpen && (
        <div 
          role="dialog"
          aria-modal="true"
          aria-labelledby="avatar-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 animate-in fade-in duration-200"
        >
          <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h3 id="avatar-modal-title" className="font-bold text-text-strong">Escolha seu Avatar</h3>
              <button 
                type="button"
                onClick={() => {
                  setIsAvatarModalOpen(false)
                  setAvatarError(null)
                }}
                aria-label="Fechar modal"
                className="p-1 rounded hover:bg-surface-muted text-text-muted transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              >
                <X className="size-5" />
              </button>
            </div>

            {avatarError && (
              <div className="mx-4 mt-4 p-3 bg-error-soft border border-error/30 rounded-lg flex items-center gap-2 text-xs text-error font-medium">
                <AlertCircle className="size-4 shrink-0" />
                <span>{avatarError}</span>
              </div>
            )}
            
            <div className="p-4 grid grid-cols-4 gap-3">
              {Object.entries(AVATAR_ICONS).map(([key, Icon]) => {
                const isActive = data.user.avatarIcon === key
                const isSavingThis = savingAvatarKey === key

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSelectAvatar(key)}
                    disabled={savingAvatarKey !== null}
                    aria-label={`Selecionar avatar ${key}`}
                    className={`relative flex items-center justify-center p-3 rounded-xl border transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      isActive
                        ? 'border-primary bg-primary-soft text-primary shadow-sm'
                        : 'border-border/50 bg-surface text-text-muted hover:border-primary/50 hover:text-primary'
                    }`}
                  >
                    {isSavingThis ? (
                      <Loader2 className="size-6 sm:size-8 animate-spin text-primary" />
                    ) : (
                      <Icon className={`size-6 sm:size-8 ${isActive ? 'drop-shadow-sm' : ''}`} />
                    )}

                    {isActive && !isSavingThis && (
                      <span className="absolute -top-1.5 -right-1.5 bg-primary text-white rounded-full p-0.5">
                        <Check className="size-3" />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
