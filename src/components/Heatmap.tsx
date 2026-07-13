'use client'

import { useMemo, useState } from 'react'
import { TrendingUp } from 'lucide-react'

interface Log {
  study_date: string
  review_count: number
}

export default function Heatmap({ logs }: { logs: Log[] }) {
  const [selectedDay, setSelectedDay] = useState<{ date: string; count: number } | null>(null)

  const { days, maxCount } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const daysArray = []

    let max = 0
    const logMap = new Map(logs.map(log => [log.study_date?.split('T')[0] || log.study_date, log.review_count]))

    for (let i = 139; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const dateString = d.toISOString().split('T')[0]
      const count = logMap.get(dateString) || 0

      if (count > max) max = count

      daysArray.push({ date: dateString, count })
    }

    return { days: daysArray, maxCount: max }
  }, [logs])

  // Formata a data ISO (yyyy-mm-dd) para o padrão brasileiro (dd/mm/aaaa)
  const formatDateBR = (isoDate: string): string => {
    const [year, month, day] = isoDate.split('-')
    return `${day}/${month}/${year}`
  }

  const getIntensityClass = (count: number, max: number) => {
    if (count === 0 || max === 0) return 'bg-surface-muted/30 dark:bg-surface-muted/40'
    const ratio = count / max
    if (ratio < 0.25) return 'bg-emerald-200 dark:bg-emerald-900/80'
    if (ratio < 0.5)  return 'bg-emerald-400 dark:bg-emerald-700/90'
    if (ratio < 0.75) return 'bg-emerald-500'
    return 'bg-emerald-600 dark:bg-emerald-400 shadow-sm dark:shadow-[0_0_8px_rgba(52,211,153,0.4)]'
  }

  return (
    <div className="panel p-6 w-full text-left">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-text-strong font-medium flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-success" />
          Consistência de Estudos
        </h3>
        <span className="text-xs text-text-muted font-medium">Últimos 140 dias</span>
      </div>

      {/* Scroll horizontal para mobile */}
      <div
        className="w-full overflow-x-auto pb-2"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}
      >
        <div className="min-w-max flex flex-col flex-wrap gap-1.5 h-[116px] content-start py-1 px-1">
          {days.map((day) => {
            const isSelected = selectedDay?.date === day.date
            return (
              <button
                key={day.date}
                type="button"
                onClick={() => setSelectedDay(day)}
                title={`${formatDateBR(day.date)}: ${day.count} flashcard${day.count !== 1 ? 's' : ''} revisado${day.count !== 1 ? 's' : ''}`}
                className={`w-3.5 h-3.5 rounded-[3px] outline-none transition-all cursor-pointer ${getIntensityClass(day.count, maxCount)} ${
                  isSelected 
                    ? 'ring-2 ring-primary ring-offset-1 ring-offset-surface scale-110 z-10' 
                    : 'hover:ring-1 hover:ring-border-strong'
                }`}
              />
            )
          })}
        </div>
      </div>

      {/* Detalhes do Dia Selecionado + Legenda */}
      <div className="mt-4 pt-3 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-xs text-text-medium w-full sm:w-auto">
          {selectedDay ? (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-bottom-1 duration-200">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary-soft/40 border border-primary/20 px-2.5 py-1 text-[11px] font-semibold text-primary">
                📅 {formatDateBR(selectedDay.date)}
              </span>
              <span className="text-text-strong font-medium">
                {selectedDay.count} flashcard{selectedDay.count !== 1 ? 's' : ''} revisado{selectedDay.count !== 1 ? 's' : ''}
              </span>
            </div>
          ) : (
            <span className="text-text-muted italic">Toque em qualquer quadrado para ver o rendimento</span>
          )}
        </div>

        {/* Legenda */}
        <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-text-muted justify-end shrink-0 w-full sm:w-auto">
          <span>Menos</span>
          <div className="w-3 h-3 rounded-[2px] bg-surface-muted" />
          <div className="w-3 h-3 rounded-[2px] bg-emerald-200 dark:bg-emerald-900/80" />
          <div className="w-3 h-3 rounded-[2px] bg-emerald-400 dark:bg-emerald-700/90" />
          <div className="w-3 h-3 rounded-[2px] bg-emerald-505 bg-emerald-500" />
          <div className="w-3 h-3 rounded-[2px] bg-emerald-600 dark:bg-emerald-400" />
          <span>Mais</span>
        </div>
      </div>
    </div>
  )
}