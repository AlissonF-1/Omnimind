'use client'

import { useRef, useState } from 'react'
import { assistantProviderIds, assistantProviders, isAssistantProvider, parseGenerationMetadata } from '@/lib/assistant/providers'
import { sendStudyRequest } from '@/lib/assistant/study-client'
import { sqlLabSubmissionLimit, type sqlLabChallenges } from '@/lib/sql-lab/catalog'
import type { SqlLabAttempt } from '@/lib/sql-lab/server'
import { useSettings } from '@/contexts/SettingsContext'

export default function SqlLabEditor({ accountId, challenge, initialAttempts, savingAvailable }: {
  accountId: string
  challenge: typeof sqlLabChallenges[number]
  initialAttempts: SqlLabAttempt[]
  savingAvailable: boolean
}) {
  const { settings } = useSettings()
  const [code, setCode] = useState('')
  const [attempts, setAttempts] = useState(initialAttempts)
  const [selected, setSelected] = useState(initialAttempts[0]?.id)
  const [provider, setProvider] = useState(settings.ai_default_model)
  const [consent, setConsent] = useState(false)
  const [pending, setPending] = useState<'submit' | 'hint' | 'feedback'>()
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [hints, setHints] = useState<string[]>([])
  const [materialIndex, setMaterialIndex] = useState(0)
  const [model, setModel] = useState('')
  const inFlight = useRef(false)
  const submission = useRef<{ id: string; code: string } | null>(null)
  const reviewed = attempts.find(({ id }) => id === selected)

  async function perform(intent: 'submit' | 'hint' | 'feedback') {
    if (inFlight.current || (intent !== 'submit' && !consent)) return
    let payload: object
    if (intent === 'submit') {
      const text = code.trim()
      if (!text) return
      if (submission.current?.code !== text) submission.current = { id: crypto.randomUUID(), code: text }
      payload = { attemptId: submission.current.id, submission: text }
    } else if (intent === 'feedback') {
      if (!reviewed || reviewed.formative_feedback) return
      payload = { attemptId: reviewed.id }
    } else {
      if (hints.length >= 3) return
      payload = { level: hints.length + 1 }
    }
    inFlight.current = true
    setPending(intent)
    setError('')
    setMessage('')
    try {
      const result = await sendStudyRequest('/api/assistant/sql-lab', {
        ...payload, intent, accountId, slug: challenge.slug, provider, consent: consent ? provider : null, eco: settings.eco_mode,
      })
      if (intent === 'hint') {
        if (typeof result.hint !== 'string' || !result.hint.trim()) throw new Error('O provedor não retornou uma pista.')
        setHints((previous) => [...previous, result.hint])
      } else {
        const attempt: SqlLabAttempt = result.attempt
        if (!attempt?.id) throw new Error('Não foi possível recuperar a tentativa.')
        setAttempts((previous) => previous.some(({ id }) => id === attempt.id)
          ? previous.map((entry) => entry.id === attempt.id ? attempt : entry)
          : [attempt, ...previous].slice(0, 25))
        setSelected(attempt.id)
        if (intent === 'submit') {
          setMessage('Consulta salva. Você já pode pedir feedback.')
          submission.current = null
        }
      }
      const metadata = parseGenerationMetadata(result.metadata)
      if (metadata?.model) setModel(metadata.model)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível concluir.')
    } finally {
      inFlight.current = false
      setPending(undefined)
    }
  }

  return <>
    <section className="sl-panel">
      <form className="sl-form" onSubmit={(event) => { event.preventDefault(); void perform('submit') }}>
        <label htmlFor="sl-code">Sua consulta SQL</label>
        <textarea id="sl-code" spellCheck={false} autoCapitalize="off" maxLength={sqlLabSubmissionLimit} value={code}
          disabled={!!pending} rows={9} placeholder="SELECT …" onChange={(event) => setCode(event.target.value)} />
        <div className="sl-actions">
          <button className="sl-button sl-primary" disabled={!!pending || !savingAvailable || !code.trim()}>Salvar tentativa</button>
          <span>{code.length}/{sqlLabSubmissionLimit}</span>
        </div>
      </form>
      {message && <p role="status">{message}</p>}
      {error && <p className="sl-error" role="alert">{error}</p>}
      {!!pending && <p role="status">{pending === 'submit' ? 'Salvando…' : 'Gerando com ' + assistantProviders[provider] + '…'}</p>}
    </section>
    <details className="sl-panel sl-assistant">
      <summary>Assistente do desafio</summary>
      <p>Pistas usam o enunciado. O feedback recebe a consulta salva que você selecionar.</p>
      <div className="sl-actions">
        <label>Provedor <select value={provider} disabled={!!pending} onChange={(event) => {
          const next = event.target.value
          if (isAssistantProvider(next)) { setProvider(next); setConsent(false); setModel('') }
        }}>{assistantProviderIds.map((id) => <option key={id} value={id}>{assistantProviders[id]}</option>)}</select></label>
        <label><input type="checkbox" checked={consent} disabled={!!pending} onChange={(event) => setConsent(event.target.checked)} />
          {' '}Autorizar envio a {assistantProviders[provider]}</label>
      </div>
      <div className="sl-actions">
        {hints.length < 3 && <button className="sl-button" disabled={!!pending || !consent}
          onClick={() => void perform('hint')}>Pedir dica {hints.length + 1} de 3</button>}
        {materialIndex < 3 && <button className="sl-button" onClick={() => setMaterialIndex((index) => index + 1)}>Ver pista do material</button>}
      </div>
      {materialIndex > 0 && <ol aria-label="Pistas do material">{challenge.hints.slice(0, materialIndex).map((hint) => <li key={hint}>{hint}</li>)}</ol>}
      {hints.length > 0 && <ol aria-label="Pistas do Assistente">{hints.map((hint, index) => <li key={index}>{hint}</li>)}</ol>}
      {model && <p>Modelo utilizado: {model}</p>}
    </details>
    <section className="sl-panel">
      <h2>Tentativas recentes</h2>
      {attempts.length ? <ul className="sl-history">{attempts.map((attempt) => <li key={attempt.id}>
        <button type="button" className="sl-button" aria-pressed={selected === attempt.id} disabled={!!pending} onClick={() => setSelected(attempt.id)}>
          {new Date(attempt.submitted_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · {attempt.formative_feedback ? 'Com feedback' : 'Aguardando feedback'}
        </button>
      </li>)}</ul> : <p>As consultas salvas aparecerão aqui.</p>}
      {reviewed && <div className="sl-review">
        <pre aria-label="Consulta salva">{reviewed.submission}</pre>
        <div className="sl-actions">
          <button className="sl-button" disabled={!!pending} onClick={() => { setCode(reviewed.submission); submission.current = null }}>Carregar no editor</button>
          {!reviewed.formative_feedback && <button className="sl-button" disabled={!!pending || !consent}
            onClick={() => void perform('feedback')}>Pedir feedback desta consulta</button>}
        </div>
        {reviewed.formative_feedback && <>
          <h3>Feedback formativo registrado</h3>
          <p>Use este comentário para revisar sua solução. A tentativa registra apenas o envio.</p>
          <p className="sl-feedback">{reviewed.formative_feedback}</p>
        </>}
      </div>}
    </section>
  </>
}
