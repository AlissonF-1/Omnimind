'use client'

import { useState, useTransition, useCallback } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, Plus, X, Target, Trash2, Check, HelpCircle, TrendingUp, Info } from 'lucide-react'
import { createExamGoal, deleteExamGoal, toggleActiveGoal, getCalendarData } from '@/actions/calendar'
import type { ExamGoal, DayData } from '@/actions/calendar'
import Link from 'next/link'

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const WEEKDAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

const PALETTE = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6',
]

interface Workspace {
  id: string
  name: string
}

interface Props {
  initialData: { days: DayData[]; examGoals: ExamGoal[] }
  initialGoals: ExamGoal[]
  currentMonth: number
  currentYear: number
  workspaces: Workspace[]
}

function getDayIntensityClass(scheduled: number, isPast: boolean, isReviewed: boolean) {
  if (isPast && isReviewed) return 'bg-emerald-500/15 border-emerald-500/30'
  if (isPast) return 'bg-transparent border-border/30 opacity-40'
  if (scheduled === 0) return 'bg-surface-muted/20 border-border/20'
  if (scheduled <= 5)  return 'bg-emerald-500/10 border-emerald-500/20'
  if (scheduled <= 10) return 'bg-emerald-500/22 border-emerald-500/35'
  if (scheduled <= 20) return 'bg-emerald-500/38 border-emerald-500/55'
  return 'bg-emerald-500/55 border-emerald-500/75 shadow-[0_0_8px_rgba(16,185,129,0.25)]'
}

function getDayTextClass(scheduled: number, isPast: boolean) {
  if (isPast) return 'text-text-muted'
  if (scheduled > 10) return 'text-emerald-300 font-bold'
  if (scheduled > 5)  return 'text-emerald-400 font-semibold'
  return 'text-text-medium'
}

export default function StudyCalendar({ initialData, initialGoals, currentMonth, currentYear, workspaces }: Props) {
  const [month, setMonth] = useState(currentMonth)
  const [year, setYear] = useState(currentYear)
  const [calData, setCalData] = useState(initialData)
  const [examGoals, setExamGoals] = useState<ExamGoal[]>(initialGoals)
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('')
  const [isPending, startTransition] = useTransition()

  // Modais e Drawer
  const [showModal, setShowModal] = useState(false)
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [selectedDayData, setSelectedDayData] = useState<DayData | null>(null)
  
  const [selectedDate, setSelectedDate] = useState('')
  const [formTitle, setFormTitle] = useState('')
  const [formColor, setFormColor] = useState('#6366f1')
  const [isCreating, setIsCreating] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  const fetchUpdatedCalendar = useCallback(async (m: number, y: number, wsId: string) => {
    startTransition(async () => {
      const data = await getCalendarData(m, y, wsId || undefined)
      setCalData(data)
      setExamGoals(data.examGoals)
    })
  }, [])

  async function navigate(dir: 1 | -1) {
    let newMonth = month + dir
    let newYear = year
    if (newMonth > 11) { newMonth = 0; newYear++ }
    if (newMonth < 0)  { newMonth = 11; newYear-- }

    setMonth(newMonth)
    setYear(newYear)
    await fetchUpdatedCalendar(newMonth, newYear, selectedWorkspaceId)
  }

  async function handleWorkspaceChange(wsId: string) {
    setSelectedWorkspaceId(wsId)
    await fetchUpdatedCalendar(month, year, wsId)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!formTitle.trim() || !selectedDate) return
    setIsCreating(true)
    try {
      await createExamGoal(formTitle.trim(), selectedDate, selectedWorkspaceId || undefined, formColor)
      const data = await getCalendarData(month, year, selectedWorkspaceId || undefined)
      setCalData(data)
      setExamGoals(data.examGoals)
      setShowModal(false)
      setFormTitle('')
    } finally {
      setIsCreating(false)
    }
  }

  async function handleDelete(goalId: string) {
    await deleteExamGoal(goalId)
    const data = await getCalendarData(month, year, selectedWorkspaceId || undefined)
    setCalData(data)
    setExamGoals(data.examGoals)
  }

  async function handleToggleActive(goalId: string) {
    await toggleActiveGoal(goalId)
    const data = await getCalendarData(month, year, selectedWorkspaceId || undefined)
    setCalData(data)
    setExamGoals(data.examGoals)
  }

  function openCreateModal(dateStr: string) {
    setSelectedDate(dateStr)
    setFormTitle('')
    setFormColor('#6366f1')
    setShowModal(true)
  }

  const firstDayOfMonth = new Date(year, month, 1).getDay()

  const examGoalsByDate = new Map<string, ExamGoal[]>()
  examGoals.forEach(g => {
    const existing = examGoalsByDate.get(g.exam_date) || []
    examGoalsByDate.set(g.exam_date, [...existing, g])
  })

  const selectedDayGoals = selectedDayData ? examGoalsByDate.get(selectedDayData.date) || [] : []

  // --- RENDERIZADORES DE COMPONENTES AUXILIARES ---
  
  // 1. Gráfico de Projeção SVG
  const renderProjectionChart = () => {
    const futureDays = calData.days.filter(d => !d.isPast)
    if (futureDays.length === 0) return null

    const width = 500
    const height = 110
    const padding = 20

    const maxVal = Math.max(...futureDays.map(d => d.scheduled), 5)
    
    const points = futureDays.map((d, index) => {
      const x = padding + (index / (futureDays.length - 1 || 1)) * (width - padding * 2)
      const y = height - padding - (d.scheduled / maxVal) * (height - padding * 2)
      return { x, y, dayNum: d.date.split('-')[2], scheduled: d.scheduled }
    })

    let linePath = ''
    let areaPath = ''

    if (points.length > 0) {
      linePath = `M ${points[0].x} ${points[0].y} `
      for (let i = 1; i < points.length; i++) {
        const cpX1 = points[i-1].x + (points[i].x - points[i-1].x) / 2
        const cpY1 = points[i-1].y
        const cpX2 = cpX1
        const cpY2 = points[i].y
        linePath += `C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${points[i].x} ${points[i].y} `
      }
      areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`
    }

    return (
      <div className="panel p-4 sm:p-5 mt-6 border border-border/30 bg-surface/50 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-3">
          <span className="p-1 rounded-lg bg-emerald-500/10 text-emerald-400">
            <TrendingUp className="size-4" />
          </span>
          <div>
            <h3 className="text-xs font-black text-text-strong uppercase tracking-wider">Projeção de Carga FSRS</h3>
            <p className="text-[10px] text-text-muted">Cards agendados para este mês</p>
          </div>
        </div>

        <div className="relative w-full h-[110px]">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="rgba(255,255,255,0.03)" strokeDasharray="3" />
            <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="rgba(255,255,255,0.05)" />

            {areaPath && <path d={areaPath} fill="url(#chartGradient)" />}
            {linePath && <path d={linePath} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}

            {points.map((p, i) => (
              <g key={i} className="group/dot cursor-pointer">
                <circle cx={p.x} cy={p.y} r="3.5" fill="#10b981" className="transition-all group-hover/dot:r-5 fill-emerald-400" />
                <circle cx={p.x} cy={p.y} r="9" fill="#10b981" fillOpacity="0" className="hover:fill-opacity-10" />
                <title>{`Dia ${p.dayNum}: ${p.scheduled} cards`}</title>
              </g>
            ))}
          </svg>
        </div>
      </div>
    )
  }

  // 2. Heatmap de Consistência Mensal
  const renderConsistencyHeatmap = () => {
    const pastDays = calData.days.filter(d => d.isPast || d.date === today)
    if (pastDays.length === 0) return null

    return (
      <div className="panel p-4 sm:p-5 mt-4 border border-border/30 bg-surface/50 backdrop-blur-sm">
        <h3 className="text-xs font-black text-text-strong uppercase tracking-wider mb-3">Consistência do Mês</h3>
        <div className="flex gap-1.5 flex-wrap">
          {pastDays.map(d => {
            const hasStudied = d.reviewed > 0
            const dayNum = d.date.split('-')[2]
            return (
              <div 
                key={d.date}
                className={`size-6 rounded-lg flex items-center justify-center text-[9px] font-black transition-all ${
                  hasStudied 
                    ? 'bg-emerald-500 text-slate-950 shadow-[0_0_8px_rgba(16,185,129,0.35)]' 
                    : 'bg-surface-muted border border-border/60 text-text-muted'
                }`}
                title={`${dayNum}/${month+1}: ${d.reviewed} revisões`}
              >
                {dayNum}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col xl:flex-row gap-6">

      {/* === CALENDÁRIO PRINCIPAL === */}
      <div className="flex-1 panel p-5 sm:p-6 relative">
        
        {/* Header de navegação e filtros */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          {/* Month/Year Navigation */}
          <div className="flex items-center justify-between md:justify-start gap-4 w-full md:w-auto">
            <button
              onClick={() => navigate(-1)}
              className="flex size-9 items-center justify-center rounded-xl border border-border text-text-muted hover:text-text-strong hover:bg-surface-muted transition-all cursor-pointer"
              disabled={isPending}
            >
              <ChevronLeft className="size-4" />
            </button>

            <div className="flex items-center gap-2 justify-center">
              <div className="text-center">
                <h2 className="text-base font-black text-text-strong leading-tight">
                  {MONTHS[month]}
                </h2>
                <p className="text-[10px] text-text-muted font-extrabold leading-none mt-0.5">{year}</p>
              </div>
              <button 
                onClick={() => setShowHelpModal(true)}
                className="text-text-muted hover:text-primary transition-colors cursor-pointer ml-1"
                title="Como funciona o Calendário?"
              >
                <HelpCircle className="size-4" />
              </button>
            </div>

            <button
              onClick={() => navigate(1)}
              className="flex size-9 items-center justify-center rounded-xl border border-border text-text-muted hover:text-text-strong hover:bg-surface-muted transition-all cursor-pointer"
              disabled={isPending}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          {/* Seletor de Workspace */}
          <div className="w-full md:w-56">
            <select
              value={selectedWorkspaceId}
              onChange={(e) => handleWorkspaceChange(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface-muted px-3 py-2.5 text-xs font-bold text-text-strong focus:outline-none focus:ring-2 focus:ring-primary/45 transition-all cursor-pointer"
            >
              <option value="">📂 Todos os Workspaces</option>
              {workspaces.map(w => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Legenda de intensidade */}
        <div className="flex items-center gap-2 mb-4 flex-wrap pb-3 border-b border-border/30">
          <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Carga FSRS:</span>
          {[
            { label: '0', cls: 'bg-surface-muted/20 border-border/20' },
            { label: '1-5', cls: 'bg-emerald-500/10 border-emerald-500/20' },
            { label: '6-10', cls: 'bg-emerald-500/22 border-emerald-500/35' },
            { label: '11-20', cls: 'bg-emerald-500/38 border-emerald-500/55' },
            { label: '20+', cls: 'bg-emerald-500/55 border-emerald-500/75 shadow-[0_0_8px_rgba(16,185,129,0.25)]' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1">
              <div className={`size-3 rounded border ${l.cls}`} />
              <span className="text-[9px] text-text-muted">{l.label}</span>
            </div>
          ))}
        </div>

        {/* Grid dos dias da semana */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map(day => (
            <div key={day} className="text-center text-[10px] font-extrabold text-text-muted uppercase tracking-wider py-1.5">
              {day}
            </div>
          ))}
        </div>

        {/* Grid dos dias do mes */}
        <div className={`grid grid-cols-7 gap-1.5 transition-opacity duration-200 ${isPending ? 'opacity-50' : 'opacity-100'}`}>
          {Array.from({ length: firstDayOfMonth }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {calData.days.map((day) => {
            const dayNum = parseInt(day.date.split('-')[2], 10)
            const isToday = day.date === today
            const goalsOnDay = examGoalsByDate.get(day.date) || []
            const hasGoal = goalsOnDay.length > 0
            const bgClass = getDayIntensityClass(day.scheduled, day.isPast, day.reviewed > 0)
            const textClass = getDayTextClass(day.scheduled, day.isPast)

            // Usa a cor da primeira prova marcada como borda
            const goalColor = hasGoal ? goalsOnDay[0].color : null

            return (
              <div key={day.date} className="relative">
                <button
                  onClick={() => setSelectedDayData(day)}
                  className={`
                    w-full aspect-square rounded-xl border text-xs
                    flex flex-col items-center justify-center
                    transition-all duration-150 relative overflow-hidden cursor-pointer hover:scale-105 hover:shadow-md
                    ${bgClass}
                    ${isToday ? 'ring-2 ring-primary ring-offset-1 ring-offset-surface z-10' : ''}
                  `}
                  style={goalColor ? { borderColor: goalColor, borderWidth: '1.5px', boxShadow: `0 0 6px ${goalColor}40` } : {}}
                >
                  <span className={`${textClass} ${isToday ? 'text-primary font-black' : ''} text-xs sm:text-sm leading-none`}>
                    {dayNum}
                  </span>

                  {day.scheduled > 0 && !day.isPast && (
                    <span className="text-[8px] sm:text-[9px] text-emerald-400 font-bold leading-none mt-0.5 opacity-80">
                      {day.scheduled}
                    </span>
                  )}

                  {day.isPast && day.reviewed > 0 && (
                    <Check className="size-2.5 sm:size-3 text-emerald-500 mt-0.5" />
                  )}
                </button>

                {/* Pontinho de provas */}
                {hasGoal && (
                  <div className="absolute bottom-1 left-0 right-0 flex justify-center gap-0.5 px-1">
                    {goalsOnDay.slice(0, 3).map((g) => (
                      <div
                        key={g.id}
                        className="h-1 rounded-full flex-1 max-w-[8px]"
                        style={{ backgroundColor: g.color }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Rodapé do calendário */}
        <div className="flex items-center gap-4 mt-6 pt-4 border-t border-border/30 flex-wrap">
          <div className="flex items-center gap-1.5 text-[10px] text-text-muted font-bold">
            <div className="size-2.5 rounded-full ring-2 ring-primary ring-offset-1 ring-offset-surface" />
            Hoje
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-text-muted font-bold">
            <Check className="size-3.5 text-emerald-500" />
            Dia estudado
          </div>
        </div>
      </div>

      {/* === PAINEL LATERAL DE PROVAS === */}
      <div className="xl:w-80 flex flex-col gap-4">
        
        {/* Botão adicionar prova */}
        <button
          onClick={() => openCreateModal(today)}
          className="flex items-center justify-center gap-2 w-full rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 text-text-muted hover:text-primary transition-all p-4 font-bold text-sm cursor-pointer"
        >
          <Plus className="size-4" />
          Adicionar Prova
        </button>

        {/* Lista de provas */}
        {examGoals.length === 0 ? (
          <div className="panel p-6 text-center text-text-muted">
            <CalendarDays className="size-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-semibold">Nenhuma prova marcada</p>
            <p className="text-xs mt-1">Crie metas para ter uma meta diária personalizada.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto pr-1">
            {examGoals.map(goal => {
              const examDate = new Date(goal.exam_date + 'T00:00:00')
              const todayDate = new Date(today + 'T00:00:00')
              const daysLeft = Math.ceil((examDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24))
              const isPast = daysLeft < 0
              const isUrgent = daysLeft >= 0 && daysLeft <= 3

              return (
                <div
                  key={goal.id}
                  className={`panel p-3.5 relative overflow-hidden transition-all ${goal.is_active_goal ? 'ring-2 ring-primary shadow-md shadow-primary/10' : ''}`}
                >
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
                    style={{ backgroundColor: goal.color }}
                  />

                  <div className="pl-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-xs text-text-strong truncate">{goal.title}</p>
                        <p className="text-[10px] text-text-muted mt-0.5">
                          {goal.exam_date.split('-').reverse().join('/')}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleToggleActive(goal.id)}
                          title={goal.is_active_goal ? 'Meta ativa — clique para desativar' : 'Definir como meta ativa'}
                          className={`flex size-7 items-center justify-center rounded-lg transition-all cursor-pointer ${goal.is_active_goal ? 'bg-primary text-white' : 'text-text-muted hover:text-primary hover:bg-primary/10'}`}
                        >
                          <Target className="size-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(goal.id)}
                          title="Remover prova"
                          className="flex size-7 items-center justify-center rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      {isPast ? (
                        <span className="text-[9px] font-bold text-text-muted bg-surface-muted px-2 py-0.5 rounded-full">
                          Encerrada
                        </span>
                      ) : isUrgent ? (
                        <span className="text-[9px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full animate-pulse">
                          🚨 {daysLeft === 0 ? 'Hoje!' : `${daysLeft} dia${daysLeft !== 1 ? 's' : ''}!`}
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold text-text-muted bg-surface-muted px-2 py-0.5 rounded-full">
                          {daysLeft} dias
                        </span>
                      )}
                      {goal.is_active_goal && (
                        <span className="text-[9px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                          🎯 Ativa
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Legendas e Gráficos de Apoio no Painel Lateral */}
        {renderProjectionChart()}
        {renderConsistencyHeatmap()}
      </div>

      {/* === DRAWER DE DETALHES DO DIA === */}
      {selectedDayData && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border-t sm:border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-sm p-5 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-border/40">
              <div>
                <h3 className="font-black text-sm text-text-strong uppercase tracking-wider">Detalhes do Dia</h3>
                <p className="text-[10px] text-text-muted mt-0.5">
                  {selectedDayData.date.split('-').reverse().join('/')}
                </p>
              </div>
              <button 
                onClick={() => setSelectedDayData(null)} 
                className="text-text-muted hover:text-text-strong transition-colors cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-center">
                  <span className="text-[9px] text-text-muted uppercase tracking-wider font-extrabold block mb-1">Agendados (FSRS)</span>
                  <span className="text-xl font-black text-emerald-400">{selectedDayData.scheduled}</span>
                </div>
                <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 text-center">
                  <span className="text-[9px] text-text-muted uppercase tracking-wider font-extrabold block mb-1">Revisados</span>
                  <span className="text-xl font-black text-blue-400">{selectedDayData.reviewed}</span>
                </div>
              </div>

              {/* Provas do dia */}
              <div>
                <h4 className="text-[10px] font-extrabold text-text-muted uppercase tracking-wider mb-2">Provas Deste Dia</h4>
                {selectedDayGoals.length === 0 ? (
                  <p className="text-xs text-text-muted italic">Nenhuma prova agendada.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedDayGoals.map(goal => (
                      <div key={goal.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-muted border border-border">
                        <div className="flex items-center gap-2">
                          <div className="size-2.5 rounded-full" style={{ backgroundColor: goal.color }} />
                          <span className="text-xs font-bold text-text-strong">{goal.title}</span>
                        </div>
                        {goal.is_active_goal && (
                          <span className="text-[8px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Ativa</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 pt-2">
                {!selectedDayData.isPast && (
                  <button
                    onClick={() => {
                      setSelectedDate(selectedDayData.date)
                      setSelectedDayData(null)
                      setShowModal(true)
                    }}
                    className="w-full btn-primary py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Plus className="size-3.5" />
                    Agendar Prova neste dia
                  </button>
                )}
                
                {selectedDayData.scheduled > 0 && !selectedDayData.isPast && (
                  <Link
                    href="/dashboard/revisoes"
                    onClick={() => setSelectedDayData(null)}
                    className="w-full text-center py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold text-xs block transition-all shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                  >
                    Iniciar Revisões
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === MODAL DE CRIAR PROVA === */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-black text-lg text-text-strong">Nova Prova</h3>
              <button onClick={() => setShowModal(false)} className="text-text-muted hover:text-text-strong transition-colors cursor-pointer">
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">
                  Nome da Prova
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="Ex: P2 de Cálculo, OAB, ENEM..."
                  className="w-full rounded-xl border border-border bg-surface-muted px-4 py-2.5 text-sm text-text-strong placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">
                  Data da Prova
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  min={today}
                  className="w-full rounded-xl border border-border bg-surface-muted px-4 py-2.5 text-sm text-text-strong focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-1.5">
                  Cor de Destaque
                </label>
                <div className="flex gap-2 flex-wrap">
                  {PALETTE.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormColor(color)}
                      className={`size-8 rounded-full transition-all cursor-pointer ${formColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-surface scale-110' : 'hover:scale-110'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-text-muted hover:bg-surface-muted transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !formTitle.trim()}
                  className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {isCreating ? 'Salvando...' : 'Adicionar Prova'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* === MODAL DE AJUDA ("COMO FUNCIONA?") === */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-border/40">
              <h3 className="font-black text-base text-text-strong flex items-center gap-2 uppercase tracking-wide">
                <Info className="text-primary size-4" />
                Como funciona?
              </h3>
              <button 
                onClick={() => setShowHelpModal(false)} 
                className="text-text-muted hover:text-text-strong transition-colors cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>
            
            <div className="space-y-4 text-xs text-text-medium leading-relaxed">
              <p>
                O Calendário consolida suas revisões baseadas no algoritmo inteligente **FSRS** (Spaced Repetition).
              </p>
              <div>
                <h4 className="font-bold text-text-strong mb-1">🟢 Intensidade Verde</h4>
                <p>Dias futuros com maior quantidade de cards agendados para revisar aparecem em tons mais escuros de verde.</p>
              </div>
              <div>
                <h4 className="font-bold text-text-strong mb-1">📅 Metas de Prova</h4>
                <p>Marque datas importantes. O sistema calcula a carga de cards até a prova e divide pelos dias restantes, gerando uma **meta diária automática** no seu painel!</p>
              </div>
              <div>
                <h4 className="font-bold text-text-strong mb-1">🎯 Meta Ativa</h4>
                <p>Selecione a prova prioritária com o ícone de alvo para fixar essa contagem de estudo no círculo de progresso diário.</p>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
