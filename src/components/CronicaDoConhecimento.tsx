'use client'

import { useRef, useState } from 'react'
import { Award, CalendarDays, ChevronDown, ChevronRight, Flame, NotebookPen, Trophy } from '@/components/icons'
import { getMilestones, type JourneyMilestone } from '@/actions/milestones'

const categories = [
  { id: 'all', label: 'Todas' },
  { id: 'review', label: 'Revisões' },
  { id: 'exam', label: 'Provas' },
  { id: 'streak', label: 'Sequências' },
  { id: 'level', label: 'Níveis' },
  { id: 'boss', label: 'Chefes' },
] as const

const dayLabel = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', dateStyle: 'long' })
const yearLabel = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', year: 'numeric' })

function milestoneIcon(type: string) {
  if (type === 'boss' || type === 'perfect_review') return Trophy
  if (type === 'streak') return Flame
  if (type === 'exam' || type === 'exam_created') return CalendarDays
  if (type === 'level') return Award
  return NotebookPen
}

export default function CronicaDoConhecimento({ initialMilestones }: { initialMilestones: JourneyMilestone[] }) {
  const [activeCategory, setActiveCategory] = useState<typeof categories[number]['id']>('all')
  const [filteredMilestones, setFilteredMilestones] = useState<JourneyMilestone[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [openYears, setOpenYears] = useState<Record<string, boolean>>({})
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({})
  const lastRequest = useRef(0)

  async function selectCategory(category: typeof activeCategory) {
    if (category === activeCategory && status !== 'error') return
    setActiveCategory(category)
    const request = ++lastRequest.current
    if (category === 'all') {
      setStatus('idle')
      return
    }

    setStatus('loading')
    try {
      const filtered = await getMilestones(category)
      if (request === lastRequest.current) {
        setFilteredMilestones(filtered)
        setStatus('idle')
      }
    } catch {
      if (request === lastRequest.current) setStatus('error')
    }
  }

  const milestones = activeCategory === 'all' ? initialMilestones : filteredMilestones
  const grouped = new Map<string, JourneyMilestone[]>()
  for (const milestone of milestones) {
    const date = new Date(milestone.milestone_date || milestone.created_at)
    const year = milestone.milestone_date?.slice(0, 4) || (Number.isFinite(date.getTime()) ? yearLabel.format(date) : '')
    const items = grouped.get(year) ?? []
    items.push(milestone)
    grouped.set(year, items)
  }
  const years = [...grouped.entries()].sort(([a], [b]) => b.localeCompare(a))

  return (
    <section className="ag-surface ag-timeline" aria-labelledby="titulo-cronica">
      <div className="ag-section-heading"><h2 id="titulo-cronica">Crônica do Conhecimento</h2></div>
      <div className="ag-filters" role="group" aria-label="Filtrar marcos">
        {categories.map((category) => (
          <button type="button" className="ag-filter" key={category.id} aria-pressed={category.id === activeCategory}
            onClick={() => selectCategory(category.id)}
          >
            {category.label}
          </button>
        ))}
      </div>
      {status === 'loading' && <p className="ag-empty" role="status">Carregando marcos…</p>}
      {status === 'error' && (
        <button className="ag-button" type="button" onClick={() => selectCategory(activeCategory)}>Tentar carregar os marcos novamente</button>
      )}
      {status === 'idle' && years.length === 0 && <p className="ag-empty" role="status">Você ainda não registrou marcos nesta categoria.</p>}
      {status === 'idle' && years.map(([year, entries], index) => {
        const open = openYears[year] ?? index === 0
        const limit = visibleCounts[year] ?? 10
        const Chevron = open ? ChevronDown : ChevronRight
        return (
          <div className="ag-year" key={year}>
            <button type="button" className="ag-year-toggle" aria-expanded={open} aria-controls={'cronica-' + year}
              onClick={() => setOpenYears((previous) => ({ ...previous, [year]: !open }))}
            >
              <span><Chevron size={16} aria-hidden="true" />{year || 'Sem data'}</span>
              <span>{entries.length} {entries.length === 1 ? 'marco' : 'marcos'}</span>
            </button>
            <div id={'cronica-' + year} className="ag-year-details" hidden={!open}>
              {open && (
                <>
                  <ol className="ag-milestones">
                    {entries.slice(0, limit).map((milestone) => {
                      const Icon = milestoneIcon(milestone.type)
                      const rawDate = milestone.milestone_date || milestone.created_at
                      const date = new Date(rawDate)
                      return (
                        <li key={milestone.id}>
                          <Icon size={16} aria-hidden="true" />
                          <div>
                            {Number.isFinite(date.getTime()) && <time dateTime={rawDate}>{dayLabel.format(date)}</time>}
                            <p>{milestone.title}</p>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                  {entries.length > limit && (
                    <button className="ag-button" type="button" onClick={() => setVisibleCounts((previous) => ({ ...previous, [year]: limit + 15 }))}>
                      Carregar mais ({entries.length - limit})
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )
      })}
    </section>
  )
}
