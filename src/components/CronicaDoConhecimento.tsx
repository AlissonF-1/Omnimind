'use client'

import { useState, useMemo, useCallback } from 'react'
import { Sparkles, Calendar, ChevronDown, ChevronRight, Trophy, Flame, Shield, Award, NotebookPen, Bookmark } from 'lucide-react'
import { JourneyMilestone, getMilestones } from '@/actions/milestones'

interface CronicaDoConhecimentoProps {
  initialMilestones: JourneyMilestone[]
}

const CATEGORIES = [
  { id: 'all', label: 'Todas' },
  { id: 'exam', label: 'Provas' },
  { id: 'streak', label: 'Streaks' },
  { id: 'level', label: 'Níveis' },
  { id: 'boss', label: 'Chefes' },
]

export default function CronicaDoConhecimento({ initialMilestones }: CronicaDoConhecimentoProps) {
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [milestones, setMilestones] = useState<JourneyMilestone[]>(initialMilestones)
  const [isLoadingFilter, setIsLoadingFilter] = useState<boolean>(false)

  // Controle de sanfona por ano (ano atual aberto por padrão)
  const currentYear = new Date().getFullYear()
  const [openYears, setOpenYears] = useState<Record<number, boolean>>({
    [currentYear]: true
  })

  // Controle de paginação (itens visíveis) por ano
  const [visibleCountPerYear, setVisibleCountPerYear] = useState<Record<number, number>>({})

  // Alterna o estado aberto/fechado de um ano no accordion
  const toggleYear = useCallback((year: number) => {
    setOpenYears((prev) => ({
      ...prev,
      [year]: !prev[year]
    }))
  }, [])

  // Expande a paginação para ver mais marcos daquele ano
  const handleLoadMoreForYear = useCallback((year: number) => {
    setVisibleCountPerYear((prev) => ({
      ...prev,
      [year]: (prev[year] || 10) + 15
    }))
  }, [])

  // Troca de filtro de categoria
  const handleCategoryChange = async (catId: string) => {
    setActiveCategory(catId)
    setIsLoadingFilter(true)
    try {
      const filtered = await getMilestones(catId)
      setMilestones(filtered)
    } catch (e) {
      console.error('Erro ao filtrar marcos:', e)
    } finally {
      setIsLoadingFilter(false)
    }
  }

  // Agrupa os marcos por ano de forma eficiente
  const groupedByYear = useMemo(() => {
    const map = new Map<number, JourneyMilestone[]>()

    for (const m of milestones) {
      const rawDate = m.milestone_date || m.created_at
      const year = new Date(rawDate).getFullYear() || currentYear
      if (!map.has(year)) {
        map.set(year, [])
      }
      map.get(year)!.push(m)
    }

    // Ordena os anos do mais recente para o mais antigo
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0])
  }, [milestones, currentYear])

  // Helper para o ícone da categoria
  const getMilestoneIcon = (type: string, title: string) => {
    const lowerTitle = title.toLowerCase()
    if (type === 'boss' || lowerTitle.includes('boss') || lowerTitle.includes('chefe')) {
      return <Trophy className="size-3.5 text-amber-400 shrink-0" />
    }
    if (type === 'streak' || lowerTitle.includes('streak') || lowerTitle.includes('ofensiva')) {
      return <Flame className="size-3.5 text-orange-500 shrink-0" />
    }
    if (type === 'exam' || lowerTitle.includes('prova') || lowerTitle.includes('simulado') || lowerTitle.includes('campanha')) {
      return <Shield className="size-3.5 text-indigo-400 shrink-0" />
    }
    if (type === 'level' || lowerTitle.includes('nível') || lowerTitle.includes('nivel') || lowerTitle.includes('conquista')) {
      return <Award className="size-3.5 text-emerald-400 shrink-0" />
    }
    if (type === 'note' || lowerTitle.includes('nota')) {
      return <NotebookPen className="size-3.5 text-sky-400 shrink-0" />
    }
    return <Bookmark className="size-3.5 text-amber-400 shrink-0" />
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-zinc-900/90 via-zinc-950 to-black p-5 sm:p-6 shadow-[0_4px_25px_rgba(0,0,0,0.3)] mb-6 select-none">
      {/* Glow de Fundo Épico */}
      <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-amber-500/5 via-orange-500/5 to-transparent pointer-events-none" />

      {/* Cabeçalho + Filtros por Categoria */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 z-10 relative">
        <h3 className="text-sm sm:text-base font-black text-amber-400 uppercase tracking-widest flex items-center gap-2">
          <Sparkles className="size-4 text-amber-400 animate-spin duration-300" />
          Crônica do Conhecimento
        </h3>

        {/* Categorias de Filtro (Pill buttons estilo mock) */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategoryChange(cat.id)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-amber-500 text-zinc-950 font-black shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                    : 'bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700/80 hover:text-zinc-200 border border-zinc-700/50'
                }`}
              >
                {cat.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Estado sem registros */}
      {groupedByYear.length === 0 && !isLoadingFilter && (
        <div className="text-center py-8 px-4 border border-dashed border-amber-500/20 rounded-xl bg-zinc-950/40">
          <Calendar className="mx-auto size-8 text-zinc-600 mb-2" />
          <p className="text-xs text-zinc-400 italic">
            A sua jornada ainda não registrou nenhum marco nesta categoria. Complete revisões e crie provas no calendário para escrever sua história!
          </p>
        </div>
      )}

      {/* Indicador de Carregamento ao trocar filtro */}
      {isLoadingFilter && (
        <div className="text-center py-8 text-xs text-amber-400/80 font-bold animate-pulse">
          Consultando a Crônica...
        </div>
      )}

      {/* Lista de Anos (Accordion) */}
      {!isLoadingFilter && groupedByYear.length > 0 && (
        <div className="space-y-3 z-10 relative">
          {groupedByYear.map(([year, yearMilestones]) => {
            const isOpen = !!openYears[year]
            const maxVisible = visibleCountPerYear[year] || 10
            const displayedItems = yearMilestones.slice(0, maxVisible)
            const hasMore = yearMilestones.length > maxVisible

            return (
              <div
                key={year}
                className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 overflow-hidden transition-all duration-300"
              >
                {/* Botão do Accordion do Ano */}
                <button
                  type="button"
                  onClick={() => toggleYear(year)}
                  className="w-full flex items-center justify-between p-3.5 px-4 bg-zinc-900/90 hover:bg-zinc-800/90 transition-colors text-left font-bold text-xs sm:text-sm text-zinc-200 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">📅</span>
                    <span className="font-extrabold text-amber-400 tracking-wide">{year}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-semibold">
                    {isOpen ? <ChevronDown className="size-4 text-amber-400" /> : <ChevronRight className="size-4 text-zinc-500" />}
                    <span>{yearMilestones.length} marco{yearMilestones.length !== 1 ? 's' : ''}</span>
                  </div>
                </button>

                {/* Conteúdo Aberto do Ano */}
                {isOpen && (
                  <div className="p-4 pt-3 bg-zinc-950/60 border-t border-zinc-800/60">
                    <div className="relative border-l border-amber-500/25 ml-2.5 pl-5 space-y-4">
                      {displayedItems.map((milestone) => {
                        const rawDate = milestone.milestone_date || milestone.created_at
                        const formattedDate = new Date(rawDate).toLocaleDateString('pt-BR', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric'
                        })

                        return (
                          <div key={milestone.id} className="relative group">
                            {/* Ponto Dourado na Linha do Tempo */}
                            <span className="absolute -left-[26px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-zinc-950 border border-amber-500/60 shadow-[0_0_8px_rgba(245,158,11,0.3)]">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 group-hover:scale-125 transition-transform" />
                            </span>

                            {/* Conteúdo do Marco */}
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                                {formattedDate}
                              </span>
                              <div className="flex items-center gap-2">
                                {getMilestoneIcon(milestone.type, milestone.title)}
                                <p className="text-xs sm:text-sm font-semibold text-zinc-100 leading-snug">
                                  {milestone.title}
                                </p>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Botão "Carregar mais" se houver mais marcos no ano */}
                    {hasMore && (
                      <div className="mt-4 pt-2 border-t border-zinc-800/40 text-center">
                        <button
                          type="button"
                          onClick={() => handleLoadMoreForYear(year)}
                          className="text-xs font-bold text-amber-400 hover:text-amber-300 hover:underline inline-flex items-center gap-1"
                        >
                          Carregar mais ({yearMilestones.length - maxVisible} restantes neste ano)
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
