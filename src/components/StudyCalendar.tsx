'use client'

import { useState, useTransition } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, Plus, X, Target, Trash2, Check } from 'lucide-react'
import { createExamGoal, deleteExamGoal, toggleActiveGoal, getCalendarData } from '@/actions/calendar'
import type { ExamGoal, DayData } from '@/actions/calendar'

const MONTHS = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const WEEKDAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab']

const PALETTE = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6',
]

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

interface Props {
  initialData: { days: DayData[]; examGoals: ExamGoal[] }
  initialGoals: ExamGoal[]
  currentMonth: number
  currentYear: number
}

export default function StudyCalendar({ initialData, initialGoals, currentMonth, currentYear }: Props) {
  const [month, setMonth] = useState(currentMonth)
  const [year, setYear] = useState(currentYear)
  const [calData, setCalData] = useState(initialData)
  const [examGoals, setExamGoals] = useState<ExamGoal[]>(initialGoals)
  const [isPending, startTransition] = useTransition()

  // Modal de criacao de prova
  const [showModal, setShowModal] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const [formTitle, setFormTitle] = useState('')
  const [formColor, setFormColor] = useState('#6366f1')
  const [isCreating, setIsCreating] = useState(false)

  // Tooltip hover
  const [hoveredDay, setHoveredDay] = useState<string | null>(null)

  const today = new Date().toISOString().split('T')[0]

  async function navigate(dir: 1 | -1) {
    let newMonth = month + dir
    let newYear = year
    if (newMonth > 11) { newMonth = 0; newYear++ }
    if (newMonth < 0)  { newMonth = 11; newYear-- }

    setMonth(newMonth)
    setYear(newYear)

    startTransition(async () => {
      const data = await getCalendarData(newMonth, newYear)
      setCalData(data)
      setExamGoals(data.examGoals)
    })
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!formTitle.trim() || !selectedDate) return
    setIsCreating(true)
    try {
      await createExamGoal(formTitle.trim(), selectedDate, undefined, formColor)
      const data = await getCalendarData(month, year)
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
    const data = await getCalendarData(month, year)
    setCalData(data)
    setExamGoals(data.examGoals)
  }

  async function handleToggleActive(goalId: string) {
    await toggleActiveGoal(goalId)
    const data = await getCalendarData(month, year)
    setCalData(data)
    setExamGoals(data.examGoals)
  }

  function openCreateModal(dateStr: string) {
    setSelectedDate(dateStr)
    setFormTitle('')
    setFormColor('#6366f1')
    setShowModal(true)
  }

  // Calcula o primeiro dia da semana do mes
  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const daysInMonth = calData.days.length

  // Map de datas para examGoals
  const examGoalsByDate = new Map<string, ExamGoal[]>()
  examGoals.forEach(g => {
    const existing = examGoalsByDate.get(g.exam_date) || []
    examGoalsByDate.set(g.exam_date, [...existing, g])
  })

  return (
    <div className="flex flex-col xl:flex-row gap-6">

      {/* === CALENDÁRIO PRINCIPAL === */}
      <div className="flex-1 panel p-5 sm:p-6">

        {/* Header de navegacao */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex size-9 items-center justify-center rounded-xl border border-border text-text-muted hover:text-text-strong hover:border-primary/30 hover:bg-primary/5 transition-all"
            disabled={isPending}
          >
            <ChevronLeft className="size-4" />
          </button>

          <div className="text-center">
            <h2 className="text-lg font-black text-text-strong tracking-tight">
              {MONTHS[month]}
            </h2>
            <p className="text-xs text-text-muted font-semibold">{year}</p>
          </div>

          <button
            onClick={() => navigate(1)}
            className="flex size-9 items-center justify-center rounded-xl border border-border text-text-muted hover:text-text-strong hover:border-primary/30 hover:bg-primary/5 transition-all"
            disabled={isPending}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        {/* Legenda de intensidade */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-[10px] text-text-muted font-semibold uppercase tracking-wider">Carga FSRS:</span>
          {[
            { label: '0', cls: 'bg-surface-muted/50 border-border/30' },
            { label: '1-5', cls: 'bg-emerald-500/15 border-emerald-500/30' },
            { label: '6-10', cls: 'bg-emerald-500/30 border-emerald-500/50' },
            { label: '11-20', cls: 'bg-emerald-500/45 border-emerald-500/65' },
            { label: '20+', cls: 'bg-emerald-500/60 border-emerald-500/80' },
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
            <div key={day} className="text-center text-[10px] font-bold text-text-muted uppercase tracking-wider py-1.5">
              {day}
            </div>
          ))}
        </div>

        {/* Grid dos dias do mes */}
        <div className={`grid grid-cols-7 gap-1 transition-opacity duration-200 ${isPending ? 'opacity-50' : 'opacity-100'}`}>
          {/* Celulas vazias para alinhar o primeiro dia */}
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
            const isHovered = hoveredDay === day.date

            return (
              <div
                key={day.date}
                className="relative"
                onMouseEnter={() => setHoveredDay(day.date)}
                onMouseLeave={() => setHoveredDay(null)}
              >
                <button
                  onClick={() => !day.isPast && openCreateModal(day.date)}
                  disabled={day.isPast}
                  className={`
                    w-full aspect-square rounded-xl border text-xs
                    flex flex-col items-center justify-center
                    transition-all duration-150 group relative overflow-hidden
                    ${bgClass}
                    ${isToday ? 'ring-2 ring-primary ring-offset-1 ring-offset-surface' : ''}
                    ${!day.isPast ? 'hover:scale-105 hover:border-primary/40 hover:shadow-md cursor-pointer' : 'cursor-default'}
                  `}
                >
                  <span className={`${textClass} ${isToday ? 'text-primary font-black' : ''} text-xs sm:text-sm leading-none`}>
                    {dayNum}
                  </span>

                  {day.scheduled > 0 && !day.isPast && (
                    <span className="text-[7px] sm:text-[9px] text-emerald-400 font-bold leading-none mt-0.5 opacity-80">
                      {day.scheduled}
                    </span>
                  )}

                  {day.isPast && day.reviewed > 0 && (
                    <Check className="size-2.5 sm:size-3 text-emerald-500 mt-0.5" />
                  )}
                </button>

                {/* Badges de provas */}
                {hasGoal && (
                  <div className="absolute bottom-0.5 left-0 right-0 flex justify-center gap-0.5 px-0.5">
                    {goalsOnDay.slice(0, 3).map((g, i) => (
                      <div
                        key={g.id}
                        className="h-1.5 rounded-full flex-1 max-w-[20px]"
                        style={{ backgroundColor: g.color }}
                        title={g.title}
                      />
                    ))}
                  </div>
                )}

                {/* Tooltip */}
                {isHovered && (day.scheduled > 0 || day.reviewed > 0 || hasGoal) && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 w-max max-w-[180px] bg-slate-900 border border-border text-white rounded-lg px-3 py-2 text-[10px] shadow-xl pointer-events-none">
                    <p className="font-bold text-white mb-1">{day.date}</p>
                    {day.scheduled > 0 && (
                      <p className="text-emerald-400">📚 {day.scheduled} cards agendados</p>
                    )}
                    {day.reviewed > 0 && (
                      <p className="text-blue-400">✅ {day.reviewed} revisados</p>
                    )}
                    {goalsOnDay.map(g => (
                      <p key={g.id} className="mt-0.5" style={{ color: g.color }}>
                        🎯 {g.title}
                      </p>
                    ))}
                    {!day.isPast && (
                      <p className="text-text-muted mt-1 text-[9px]">Clique para adicionar prova</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Rodape com legenda */}
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border/30 flex-wrap">
          <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
            <div className="size-2.5 rounded-full ring-2 ring-primary ring-offset-1 ring-offset-surface" />
            Hoje
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
            <Check className="size-3 text-emerald-500" />
            Dia estudado
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
            <div className="h-1.5 w-4 rounded-full bg-primary" />
            Prova marcada
          </div>
        </div>
      </div>

      {/* === PAINEL LATERAL DE PROVAS === */}
      <div className="xl:w-80 flex flex-col gap-4">

        {/* Botao adicionar prova */}
        <button
          onClick={() => openCreateModal(today)}
          className="flex items-center justify-center gap-2 w-full rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 text-text-muted hover:text-primary transition-all p-4 font-bold text-sm"
        >
          <Plus className="size-4" />
          Adicionar Prova
        </button>

        {/* Lista de provas */}
        {examGoals.length === 0 ? (
          <div className="panel p-6 text-center text-text-muted">
            <CalendarDays className="size-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-semibold">Nenhuma prova marcada</p>
            <p className="text-xs mt-1">Clique em um dia no calendário para adicionar uma prova e ter uma meta diária personalizada.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {examGoals.map(goal => {
              const examDate = new Date(goal.exam_date + 'T00:00:00')
              const todayDate = new Date(today + 'T00:00:00')
              const daysLeft = Math.ceil((examDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24))
              const isPast = daysLeft < 0
              const isUrgent = daysLeft >= 0 && daysLeft <= 3

              return (
                <div
                  key={goal.id}
                  className={`panel p-4 relative overflow-hidden transition-all ${goal.is_active_goal ? 'ring-2 ring-primary shadow-md shadow-primary/10' : ''}`}
                >
                  {/* Barra colorida lateral */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
                    style={{ backgroundColor: goal.color }}
                  />

                  <div className="pl-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-text-strong truncate">{goal.title}</p>
                        <p className="text-[11px] text-text-muted mt-0.5">
                          {goal.exam_date.split('-').reverse().join('/')}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleToggleActive(goal.id)}
                          title={goal.is_active_goal ? 'Meta ativa — clique para desativar' : 'Definir como meta ativa'}
                          className={`flex size-7 items-center justify-center rounded-lg transition-all ${goal.is_active_goal ? 'bg-primary text-white' : 'text-text-muted hover:text-primary hover:bg-primary/10'}`}
                        >
                          <Target className="size-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(goal.id)}
                          title="Remover prova"
                          className="flex size-7 items-center justify-center rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="mt-2.5 flex items-center gap-2">
                      {isPast ? (
                        <span className="text-[10px] font-bold text-text-muted bg-surface-muted px-2 py-0.5 rounded-full">
                          Encerrada
                        </span>
                      ) : isUrgent ? (
                        <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full animate-pulse">
                          🚨 {daysLeft === 0 ? 'Hoje!' : `${daysLeft} dia${daysLeft !== 1 ? 's' : ''}!`}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-text-muted bg-surface-muted px-2 py-0.5 rounded-full">
                          {daysLeft} dias
                        </span>
                      )}
                      {goal.is_active_goal && (
                        <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                          🎯 Meta Ativa
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Dica */}
        <div className="panel-muted p-4 rounded-xl text-xs text-text-muted leading-relaxed">
          <p className="font-bold text-text-medium mb-1">💡 Como funciona?</p>
          <p>O app conta os cards pendentes até a data da sua prova e divide pelos dias restantes. Isso ajusta automaticamente a <strong className="text-text-strong">meta diária do Círculo de Progresso</strong> no Dashboard!</p>
          <p className="mt-2">Use <strong className="text-text-strong">🎯 Meta Ativa</strong> para fixar uma prova específica.</p>
        </div>
      </div>

      {/* === MODAL DE CRIAR PROVA === */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-black text-lg text-text-strong">Nova Prova</h3>
              <button onClick={() => setShowModal(false)} className="text-text-muted hover:text-text-strong transition-colors">
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
                  Cor
                </label>
                <div className="flex gap-2 flex-wrap">
                  {PALETTE.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormColor(color)}
                      className={`size-8 rounded-full transition-all ${formColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-surface scale-110' : 'hover:scale-110'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-text-muted hover:bg-surface-muted transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !formTitle.trim()}
                  className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-50 transition-all"
                >
                  {isCreating ? 'Salvando...' : 'Adicionar Prova'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
