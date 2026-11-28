'use client'

import { useActionState } from 'react'
import { Timer } from '@/components/icons'
import { updateAcademyProfile } from '@/actions/academy'

export function StudyGoal({ minutes }: { minutes?: number }) {
  const [state, update, saving] = useActionState(async (_state: string, form: FormData) => {
    const result = await updateAcademyProfile(Number(form.get('minutes')))
    return 'error' in result ? result.error ?? 'Não foi possível salvar.' : 'Disponibilidade salva.'
  }, '')
  return <form action={update} className="ac-goal">
    <div className="ac-mini-heading"><Timer size={18} aria-hidden="true" /><label htmlFor="academy-minutes">Tempo de estudo por dia</label></div>
    <div className="ac-form-line">
      <div className="ac-number-field"><input id="academy-minutes" name="minutes" type="number" min={10} max={120} required
        defaultValue={minutes ?? 20} aria-describedby="academy-goal-unit" /><span id="academy-goal-unit">min</span></div>
      <button type="submit" className="ac-btn" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
    </div>
    {state ? <p role="status">{state}</p> : !minutes ? <p>Escolha quanto tempo você tem para estudar.</p> : null}
  </form>
}
