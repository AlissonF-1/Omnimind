'use client'

import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { CalendarDays } from 'lucide-react'

type StudyLog = { study_date: string; review_count: number; topics?: string[] | null }

const dayCount = 140
const dayMs = 86_400_000

function displayDate(date: string) {
  const [year, month, day] = date.split('-')
  return day + '/' + month + '/' + year
}

export default function Heatmap({ logs, today }: { logs: StudyLog[]; today: string }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(dayCount - 1)
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  const days = useMemo(() => {
    const last = Date.parse(today + 'T00:00:00Z')
    const byDate = new Map(logs.map((log) => [log.study_date?.slice(0, 10), log]))

    return Array.from({ length: dayCount }, (_, index) => {
      const date = new Date(last - (dayCount - 1 - index) * dayMs).toISOString().slice(0, 10)
      const log = byDate.get(date)
      return { date, count: log?.review_count ?? 0, topics: log?.topics ?? [] }
    })
  }, [logs, today])
  const peak = Math.max(1, ...days.map((day) => day.count))
  const selected = selectedIndex === null ? null : days[selectedIndex]

  function handleArrow(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const offsets = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }
    const offset = offsets[event.key as keyof typeof offsets]
    if (offset === undefined && event.key !== 'Home' && event.key !== 'End') return

    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? dayCount - 1
      : Math.min(dayCount - 1, Math.max(0, index + offset))
    buttons.current[next]?.focus()
  }

  return (
    <article className="dh-panel dh-pad">
      <div className="dh-row dh-between">
        <div className="dh-row">
          <span className="dh-icon"><CalendarDays size={17} aria-hidden="true" /></span>
          <h3 className="dh-title">Consistência de estudos</h3>
        </div>
        <span className="dh-caption !text-xs">Últimos 140 dias</span>
      </div>

      <div className="dh-heat-scroll mt-3">
        <div className="dh-heat-grid" role="group" aria-label="Atividade diária. Use as setas para navegar entre as datas.">
          {days.map((day, index) => {
            const intensity = Math.min(4, Math.ceil(day.count * 4 / peak))
            const label = displayDate(day.date) + ' · ' + day.count + (day.count === 1 ? ' revisão' : ' revisões')
            return (
              <button
                key={day.date} type="button" className={'dh-heat-cell dh-heat-' + intensity}
                ref={(node) => { buttons.current[index] = node }}
                aria-label={label} title={label} aria-pressed={selectedIndex === index}
                tabIndex={focusedIndex === index ? 0 : -1}
                onFocus={() => setFocusedIndex(index)}
                onClick={() => setSelectedIndex(index)}
                onKeyDown={(event) => handleArrow(event, index)}
              />
            )
          })}
        </div>
      </div>

      <div className="dh-row dh-between dh-divider">
        <p className="dh-caption !text-xs" aria-live="polite">
          {selected
            ? displayDate(selected.date) + ' · ' + selected.count + (selected.count === 1 ? ' revisão' : ' revisões') + (selected.topics.length ? ' · ' + selected.topics.join(', ') : '')
            : 'Selecione um dia para ver as revisões e os assuntos.'}
        </p>
        <div className="dh-heat-key dh-caption !text-xs" aria-hidden="true">
          Menos {Array.from({ length: 5 }, (_, index) => <i key={index} className={'dh-heat-' + index} />)} Mais
        </div>
      </div>
    </article>
  )
}
