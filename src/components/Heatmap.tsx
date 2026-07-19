'use client'

import { useMemo, useState } from 'react'
import { TrendingUp, Flame, Zap, Coffee } from 'lucide-react'

interface Log {
  study_date: string
  review_count: number
  topics?: string[]
}

export default function Heatmap({ logs }: { logs: Log[] }) {
  const [selectedDay, setSelectedDay] = useState<{ date: string; count: number; topics?: string[] } | null>(null)

  const { days, maxCount } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const daysArray = []

    let max = 0
    const logMap = new Map(logs.map(log => [
      log.study_date?.split('T')[0] || log.study_date, 
      { count: log.review_count, topics: log.topics }
    ]))

    for (let i = 139; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const dateString = d.toISOString().split('T')[0]
      const count = logMap.get(dateString)?.count || 0
      const topics = logMap.get(dateString)?.topics || []

      if (count > max) max = count

      daysArray.push({ date: dateString, count, topics })
    }

    return { days: daysArray, maxCount: max }
  }, [logs])

  // Formata a data ISO (yyyy-mm-dd) para o padrão brasileiro (dd/mm/aaaa)
  const formatDateBR = (isoDate: string): string => {
    const [year, month, day] = isoDate.split('-')
    return `${day}/${month}/${year}`
  }

  const getIntensityClass = (count: number, max: number) => {
    if (count === 0 || max === 0) return 'bg-surface-muted/40 hover:bg-surface-muted'
    const ratio = count / max
    if (ratio < 0.25) return 'bg-emerald-500/30 border border-emerald-500/20'
    if (ratio < 0.5)  return 'bg-emerald-500/60 border border-emerald-500/40'
    if (ratio < 0.75) return 'bg-emerald-500 border border-emerald-400/60 shadow-[0_0_6px_rgba(16,185,129,0.3)]'
    return 'bg-emerald-400 border border-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.6)] animate-pulse'
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-surface via-surface/90 to-surface-muted/40 p-6 shadow-[0_4px_20px_rgba(0,0,0,0.15)] hover:border-emerald-500/30 transition-all duration-300 w-full text-left">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-text-strong font-bold flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-500">
            <TrendingUp className="w-3.5 h-3.5" />
          </span>
          Consistência de Estudos
        </h3>
        <span className="text-xs text-text-muted font-semibold">Últimos 140 dias</span>
      </div>

      {/* Scroll horizontal para mobile */}
      <div
        className="w-full overflow-x-auto pb-2"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}
      >
        <div className="min-w-max grid grid-rows-7 grid-flow-col gap-1.5 py-1 px-1">
          {days.map((day) => {
            const isSelected = selectedDay?.date === day.date
            const isHighActivity = day.count > 0 && maxCount > 0 && (day.count / maxCount) >= 0.75

            return (
              <div key={day.date} className="group relative flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`w-3.5 h-3.5 rounded-[4px] outline-none transition-all cursor-pointer ${getIntensityClass(day.count, maxCount)} ${
                    isSelected 
                      ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-surface scale-125 z-20' 
                      : 'hover:scale-125 hover:z-10'
                  }`}
                />

                {/* Storytelling Tooltip no Hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 pointer-events-none">
                  <div className="bg-surface-muted/95 border border-border/80 rounded-xl px-3 py-2 text-xs shadow-2xl backdrop-blur-md whitespace-nowrap min-w-[140px] animate-in fade-in zoom-in-95 duration-150">
                    <p className="font-bold text-text-strong flex items-center gap-1">
                      📅 {formatDateBR(day.date)}
                    </p>
                    <p className="text-text-medium mt-0.5 font-semibold">
                      {day.count === 0 ? (
                        <span className="text-text-muted flex items-center gap-1"><Coffee className="size-3 text-amber-500/70" /> Nenhum card revisado</span>
                      ) : (
                        <span className="text-emerald-400 flex items-center gap-1"><Zap className="size-3 fill-current" /> {day.count} flashcard{day.count !== 1 ? 's' : ''}</span>
                      )}
                    </p>
                    {day.count > 0 && (
                      <p className="text-[10px] font-bold text-amber-400 mt-1 flex items-center gap-1 border-t border-border/30 pt-1">
                        {isHighActivity ? '⚡ Alto rendimento!' : '🔥 Dia de consistência'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detalhes do Dia Selecionado + Legenda */}
      <div className="mt-4 pt-3 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-xs text-text-medium w-full sm:w-auto">
          {selectedDay ? (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-bottom-1 duration-200">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-[11px] font-extrabold text-emerald-400 shadow-sm">
                📅 {formatDateBR(selectedDay.date)}
              </span>
              <span className="text-text-strong font-bold">
                {selectedDay.count} flashcard{selectedDay.count !== 1 ? 's' : ''}
              </span>
              {selectedDay.topics && selectedDay.topics.length > 0 && (
                <span className="text-xs text-text-muted max-w-[200px] sm:max-w-md truncate font-medium" title={selectedDay.topics.join(', ')}>
                  ({selectedDay.topics.join(', ')})
                </span>
              )}
            </div>
          ) : (
            <span className="text-text-muted italic text-[11px] font-medium">Passe o cursor ou toque em qualquer quadrado para ver a história do dia</span>
          )}
        </div>

        {/* Legenda */}
        <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-text-muted justify-end shrink-0 w-full sm:w-auto">
          <span>Menos</span>
          <div className="w-3 h-3 rounded-[3px] bg-surface-muted/40" />
          <div className="w-3 h-3 rounded-[3px] bg-emerald-500/30" />
          <div className="w-3 h-3 rounded-[3px] bg-emerald-500/60" />
          <div className="w-3 h-3 rounded-[3px] bg-emerald-500" />
          <div className="w-3 h-3 rounded-[3px] bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]" />
          <span>Mais</span>
        </div>
      </div>
    </div>
  )
}