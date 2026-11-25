'use client'

import { useId, useState } from 'react'
import { AlertTriangle, CalendarDays, CheckCircle2, Flame, LoaderCircle, Play } from 'lucide-react'
import { toggleSprintMode } from '@/actions/workspaces'

interface SprintControlProps {
  workspaceId: string
  isSprintMode: boolean
  sprintDate: string | null
  today: string
}

export default function SprintControl({ workspaceId, isSprintMode, sprintDate, today }: SprintControlProps) {
  const [isActive, setIsActive] = useState(isSprintMode)
  const [date, setDate] = useState(sprintDate?.split('T')[0] ?? '')
  const [isLoading, setIsLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const inputId = useId()
  const daysRemaining = isActive && date ? Math.max(0, Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000)) : null
  const dueSoon = daysRemaining !== null && daysRemaining <= 3

  async function updateSprint() {
    if (isLoading) return
    setError('')
    if (isActive && !confirming) {
      setConfirming(true)
      return
    }
    if (!isActive && (!date || date < today || !Number.isFinite(Date.parse(date)))) {
      setError('Selecione uma data de prova igual ou posterior a hoje.')
      return
    }

    setIsLoading(true)
    try {
      await toggleSprintMode(workspaceId, !isActive, isActive ? null : new Date(date).toISOString())
      setIsActive(!isActive)
      setConfirming(false)
    } catch {
      setError('Não foi possível atualizar o Modo Sprint. Tente novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  return <section className="wp-panel wp-sprint" aria-label="Controle do Modo Sprint" data-active={isActive}>
    <div className="wp-sprint-copy">
      <span className="wp-icon wp-flame"><Flame size={25} aria-hidden="true" /></span>
      <div>
        <div className="wp-title-line">
          <h2>Modo Sprint</h2>
          {isActive && <span className="wp-pill wp-active"><CheckCircle2 size={13} aria-hidden="true" /> Ativo</span>}
        </div>
        <p>{daysRemaining === null ? 'Force a revisão diária até a data da prova.' : daysRemaining === 0
          ? 'A prova é hoje.' : `${daysRemaining} ${daysRemaining === 1 ? 'dia' : 'dias'} para a prova.`}</p>
        {dueSoon && <span className="wp-due"><AlertTriangle size={13} aria-hidden="true" /> Revisão prioritária</span>}
      </div>
    </div>
    <form className="wp-sprint-form" onSubmit={(event) => { event.preventDefault(); void updateSprint() }}>
      <label className="wp-date" htmlFor={inputId}>
        <CalendarDays size={17} aria-hidden="true" />
        <span className="sr-only">Data da prova</span>
        <input id={inputId} type="date" min={isActive ? undefined : today} value={date}
          disabled={isActive || isLoading} onChange={(event) => { setDate(event.target.value); setError('') }} />
      </label>
      {confirming ? <div className="wp-confirm">
        <button type="submit" className="wp-button wp-danger" disabled={isLoading}>{isLoading ? 'Salvando…' : 'Confirmar desativação'}</button>
        <button type="button" className="wp-button" disabled={isLoading} onClick={() => { setConfirming(false); setError('') }}>Cancelar</button>
      </div> : <button type="submit" className={isActive ? 'wp-button' : 'wp-button wp-primary'} disabled={isLoading || (!isActive && !date)}>
        {isLoading ? <><LoaderCircle size={17} className="wp-spinner" aria-hidden="true" /> Salvando…</>
          : isActive ? 'Desativar Sprint' : <><Play size={17} aria-hidden="true" /> Ativar Sprint</>}
      </button>}
      {error && <p className="wp-error" role="alert">{error}</p>}
    </form>
  </section>
}
