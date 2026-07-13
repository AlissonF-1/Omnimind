'use client'

import { useState } from 'react'
import { Trophy, Shield, Sparkles, RefreshCw } from 'lucide-react'
import { generatePlayerTitle } from '@/actions/achievements'
import { ACHIEVEMENTS } from '@/types/achievements'
import Link from 'next/link'
import Image from 'next/image'

interface ProfileData {
  user: {
    name: string
    email: string | undefined
    avatarUrl: string | null
    playerTitle: string
  }
  totalXp: number
  currentLevel: number
  streakShields: number
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

  // Calcular progresso do nível atual
  const currentLevel = data.currentLevel
  const totalXp = data.totalXp
  const xpForCurrentLevel = Math.pow(currentLevel - 1, 2) * 5
  const xpForNextLevel = Math.pow(currentLevel, 2) * 5
  const range = xpForNextLevel - xpForCurrentLevel
  const progress = totalXp - xpForCurrentLevel
  const percent = Math.min(Math.max((progress / range) * 100, 0), 100)

  // Borda evolutiva do avatar com base no nível
  const getAvatarRingClass = (level: number) => {
    if (level <= 5) return 'ring-4 ring-slate-200 dark:ring-slate-800'
    if (level <= 15) return 'ring-4 ring-primary shadow-[0_0_20px_rgba(99,102,241,0.5)] animate-pulse'
    return 'ring-4 ring-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.6)]'
  }

  // Pegar as iniciais do nome
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  }

  // Trigar nova geração de título de IA
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
      console.error(err)
    } finally {
      setIsGeneratingTitle(false)
    }
  }

  // Atividade máxima recente para escala do gráfico de barras
  const maxReviews = Math.max(...data.recentActivity.map((d) => d.reviews), 1)

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      
      {/* 1. Header (Identidade, Nível e XP) */}
      <div className="panel p-5 sm:p-8 flex flex-row items-center gap-4 sm:gap-8 relative overflow-hidden bg-cover bg-center" style={{ backgroundImage: 'url("/images/profile_banner.jpg")' }}>
        {/* Glow de fundo / Overlay escuro para garantir leitura do texto */}
        <div className="absolute inset-0 z-0 bg-slate-900/70" />
        <div className="absolute inset-0 z-0 bg-gradient-to-r from-slate-950 via-slate-900/80 to-transparent" />

        {/* Avatar com moldura evolutiva */}
        <div className="relative z-10 shrink-0 size-20 sm:size-28">
          {/* Anel externo animado — separado para não afetar a opacidade da imagem */}
          <div className={`absolute inset-0 rounded-full transition-all duration-300 ${
            currentLevel <= 5
              ? 'ring-4 ring-slate-300 dark:ring-slate-700'
              : currentLevel <= 15
              ? 'ring-4 ring-primary shadow-[0_0_20px_rgba(99,102,241,0.4)] animate-pulse'
              : 'ring-4 ring-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.6)] animate-pulse'
          }`} />

          {/* Imagem ou iniciais — nunca afetado pelo animate-pulse */}
          <div className="size-full rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
            {data.user.avatarUrl ? (
              <img
                src={data.user.avatarUrl}
                alt={data.user.name}
                className="size-full rounded-full object-cover"
              />
            ) : (
              <span className="text-2xl sm:text-4xl font-black text-text-strong tracking-tight">
                {getInitials(data.user.name)}
              </span>
            )}
          </div>
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
                onClick={handleRegenerateTitle}
                disabled={isGeneratingTitle}
                className="p-1 rounded-md text-text-muted hover:text-primary hover:bg-surface-muted transition-all shrink-0"
                title="Regerar título de IA baseado em seus estudos"
              >
                {isGeneratingTitle ? (
                  <RefreshCw className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
              </button>
            </div>
            <p className="text-[10px] sm:text-xs text-text-muted">{data.user.email}</p>
          </div>

          {/* Barra de XP (Visível apenas a partir de telas pequenas) */}
          <div className="hidden sm:block space-y-1.5 w-full">
            <div className="flex justify-between text-xs font-bold text-text-muted">
              <span>Progresso do Nível</span>
              <span>{totalXp} XP total</span>
            </div>
            <div className="w-full h-3 rounded-full bg-border/40 overflow-hidden relative border border-border/10">
              <div 
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-primary transition-all duration-500 ease-out" 
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-semibold text-text-muted">
              <span>{progress} / {range} XP para subir</span>
              <span>Nível {currentLevel + 1}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Barra de XP Móvel (Exibida separadamente apenas no mobile para evitar esmagamento) */}
      <div className="block sm:hidden panel p-4 space-y-2">
        <div className="flex justify-between text-xs font-bold text-text-muted">
          <span>Progresso do Nível {currentLevel}</span>
          <span>{totalXp} XP total</span>
        </div>
        <div className="w-full h-2.5 rounded-full bg-border/40 overflow-hidden relative border border-border/10">
          <div 
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-primary transition-all duration-500 ease-out" 
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="flex justify-between text-[9px] font-semibold text-text-muted">
          <span>{progress} / {range} XP para subir para o Nível {currentLevel + 1}</span>
        </div>
      </div>

      {/* 2. Grid de Estatísticas (O "Hall da Fama" pessoal) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        <div className="panel p-4 flex flex-col justify-between h-28 hover:border-orange-500/20 transition-colors relative overflow-hidden group">
          <div className="absolute top-3 right-3 opacity-100 sm:opacity-20 group-hover:opacity-100 transition-opacity size-10 rounded-lg overflow-hidden">
            <Image src="/images/stat_streak_3d.png" alt="Streak" fill className="object-cover" />
          </div>
          <div className="flex justify-between items-start relative z-10">
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Recorde Streak</span>
          </div>
          <div className="relative z-10">
            <h4 className="text-2xl font-black text-text-strong tracking-tight">{data.maxStreak}</h4>
            <p className="text-[10px] font-medium text-text-muted">Dias seguidos de estudo</p>
          </div>
        </div>

        <div className="panel p-4 flex flex-col justify-between h-28 hover:border-primary/20 transition-colors relative overflow-hidden group">
          <div className="absolute top-3 right-3 opacity-100 sm:opacity-20 group-hover:opacity-100 transition-opacity size-10 rounded-lg overflow-hidden">
            <Image src="/images/profile_revisoes_3d.png" alt="Revisões" fill className="object-cover" />
          </div>
          <div className="flex justify-between items-start relative z-10">
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Revisões</span>
          </div>
          <div className="relative z-10">
            <h4 className="text-2xl font-black text-text-strong tracking-tight">{data.cardsReviewed}</h4>
            <p className="text-[10px] font-medium text-text-muted">Cards revisados no total</p>
          </div>
        </div>

        <div className="panel p-4 flex flex-col justify-between h-28 hover:border-emerald-500/20 transition-colors relative overflow-hidden group">
          <div className="absolute top-3 right-3 opacity-100 sm:opacity-20 group-hover:opacity-100 transition-opacity size-10 rounded-lg overflow-hidden">
            <Image src="/images/profile_notas_3d.png" alt="Notas" fill className="object-cover" />
          </div>
          <div className="flex justify-between items-start relative z-10">
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Notas</span>
          </div>
          <div className="relative z-10">
            <h4 className="text-2xl font-black text-text-strong tracking-tight">{data.notesCreated}</h4>
            <p className="text-[10px] font-medium text-text-muted">Notas escritas no cérebro</p>
          </div>
        </div>

        <div className="panel p-4 flex flex-col justify-between h-28 hover:border-indigo-500/20 transition-colors relative overflow-hidden group">
          <div className="absolute top-3 right-3 opacity-100 sm:opacity-20 group-hover:opacity-100 transition-opacity size-10 rounded-lg overflow-hidden">
            <Image src="/images/profile_gabaritadas_3d.png" alt="Gabaritadas" fill className="object-cover" />
          </div>
          <div className="flex justify-between items-start relative z-10">
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Gabaritadas</span>
          </div>
          <div className="relative z-10">
            <h4 className="text-2xl font-black text-text-strong tracking-tight">{data.perfectExams}</h4>
            <p className="text-[10px] font-medium text-text-muted">Simulados com 100% acertos</p>
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
                .filter(Boolean) // Remove legados apagados ou nulos
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

        {/* 4. Resumo da Jornada Recente (Gráfico de barras puro Tailwind) */}
        <div className="panel p-5 md:col-span-2 flex flex-col gap-4">
          <div>
            <h3 className="font-extrabold text-base text-text-strong tracking-wide">
              Atividade Semanal
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              Quantidade de flashcards revisados por dia nos últimos 7 dias.
            </p>
          </div>

          {/* Gráfico de barras pura CSS Tailwind */}
          <div className="flex-1 flex items-end justify-between gap-2.5 h-44 px-2 pt-4 relative">
            
            {/* Grid lines horizontais de fundo */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none select-none py-1">
              <div className="border-b border-border/20 w-full h-0" />
              <div className="border-b border-border/20 w-full h-0" />
              <div className="border-b border-border/20 w-full h-0" />
              <div className="border-b border-border/20 w-full h-0" />
            </div>

            {data.recentActivity.map((day, idx) => {
              const hPercent = (day.reviews / maxReviews) * 85 // Capped a 85% para não estourar em cima
              return (
                <div key={idx} className="flex-1 flex flex-col items-center justify-end gap-2 h-full group z-10 relative">
                  {/* Tooltip do valor no hover */}
                  <span className="absolute -top-6 text-[10px] font-extrabold text-white bg-slate-900 px-2 py-0.5 rounded shadow opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none select-none">
                    {day.reviews} cards
                  </span>
                  
                  {/* Barra */}
                  <div 
                    className="w-full sm:w-10 rounded-t-lg bg-gradient-to-t from-primary/80 to-primary shadow-[0_4px_12px_rgba(99,102,241,0.2)] group-hover:from-indigo-500 group-hover:to-primary transition-all duration-300 cursor-pointer min-h-[4px]"
                    style={{ height: `${Math.max(hPercent, 3)}%` }}
                  />

                  {/* Nome do dia */}
                  <span className="text-[10px] font-bold text-text-muted capitalize">
                    {day.date.split(',')[0]}
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

    </div>
  )
}
