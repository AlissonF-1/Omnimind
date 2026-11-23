'use client'

import { useActionState, useState, type ReactNode } from 'react'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import type { LearningFormState } from '@/actions/learning'

type FormAction = (state: LearningFormState, form: FormData) => Promise<LearningFormState>

function LearningForm({ action, label, primary, children }: {
  action: FormAction
  label: string
  primary?: boolean
  children?: ReactNode
}) {
  const [state, submit, pending] = useActionState(action, {})
  return (
    <form className="lp-form" action={submit} aria-busy={pending}>
      {children}
      {state.error && <p className="lp-error-text" role="alert">{state.error}</p>}
      <button className={primary ? 'lp-button lp-primary' : 'lp-button'} type="submit" disabled={pending}>
        {pending ? <LoaderCircle size={16} className="motion-safe:animate-spin" aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}
        {pending ? 'Salvando…' : label}
      </button>
    </form>
  )
}

export function LearningActionForm({ action, label, primary = false }: { action: FormAction; label: string; primary?: boolean }) {
  return <LearningForm action={action} label={label} primary={primary} />
}

export function ChallengeDeliveryForm({ action }: { action: FormAction }) {
  const [mode, setMode] = useState<'text' | 'url'>('text')
  const [response, setResponse] = useState('')
  const [repository, setRepository] = useState('')

  return (
    <LearningForm action={action} label="Entregar desafio" primary>
      <fieldset className="lp-field lp-options">
        <legend>Formato da entrega</legend>
        <label><input type="radio" name="mode" value="text" checked={mode === 'text'} onChange={() => setMode('text')} /> Resposta textual</label>
        <label><input type="radio" name="mode" value="url" checked={mode === 'url'} onChange={() => setMode('url')} /> Link do repositório</label>
      </fieldset>
      {mode === 'text' ? (
        <label className="lp-field">Sua solução
          <textarea name="response" rows={7} required maxLength={12000} spellCheck={false} value={response}
            onChange={(event) => setResponse(event.target.value)} placeholder="Cole sua consulta e explique o tratamento de NULL." />
        </label>
      ) : (
        <label className="lp-field">Endereço HTTPS do repositório
          <input name="repository" type="url" inputMode="url" maxLength={2048} required value={repository}
            onChange={(event) => setRepository(event.target.value)} placeholder="https://github.com/usuario/repositorio" />
        </label>
      )}
    </LearningForm>
  )
}

export function ChallengeReviewForm({ action, rubric }: { action: FormAction; rubric: string[] }) {
  return (
    <LearningForm action={action} label="Registrar avaliação" primary>
      {rubric.map((criterion, index) => (
        <fieldset key={criterion} className="lp-field lp-options">
          <legend>{criterion}</legend>
          <label><input type="radio" name={'criterion-' + index} value="yes" required /> Atende</label>
          <label><input type="radio" name={'criterion-' + index} value="no" required /> Não atende</label>
        </fieldset>
      ))}
    </LearningForm>
  )
}
