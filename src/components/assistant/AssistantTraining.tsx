'use client'

import { useEffect, useRef, useState } from 'react'
import { Blocks, MessagesSquare } from '@/components/icons'
import { assistantProviderIds, assistantProviders, isAssistantProvider, parseGenerationMetadata, type AssistantProvider } from '@/lib/assistant/providers'
import { sendStudyRequest } from '@/lib/assistant/study-client'
import {
  isTrainingTopic, nextTrainingQuestion, parseTrainingFeedback, parseTrainingReport, parseTrainingSession,
  trainingAnswerLimit, trainingQuestion, trainingTopics, type TrainingMode, type TrainingSession, type TrainingTopic,
} from '@/lib/assistant/training'

type Saved = { session: TrainingSession | null; draft: string; provider?: AssistantProvider }

function load(key: string): Saved {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(key) ?? 'null')
    return {
      session: parseTrainingSession(value?.session),
      draft: typeof value?.draft === 'string' ? value.draft.slice(0, trainingAnswerLimit) : '',
      provider: isAssistantProvider(value?.provider) ? value.provider : undefined,
    }
  } catch { return { session: null, draft: '' } }
}

export default function AssistantTraining({ accountId, defaultProvider, eco }: {
  accountId: string
  defaultProvider: AssistantProvider
  eco: boolean
}) {
  const storageKey = 'omnimind-training:' + accountId
  const [saved, setSaved] = useState(() => load(storageKey))
  const [topic, setTopic] = useState<TrainingTopic>('backend')
  const [level, setLevel] = useState<1 | 2>(1)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [model, setModel] = useState('')
  const request = useRef<AbortController | null>(null)
  const { session, draft } = saved
  const provider = saved.provider ?? defaultProvider
  const question = session && trainingQuestion(session.pendingId, session.topic)
  const next = session && nextTrainingQuestion(session)

  useEffect(() => {
    try { window.sessionStorage.setItem(storageKey, JSON.stringify(saved)) } catch { /* Sessão disponível em memória. */ }
  }, [storageKey, saved])
  useEffect(() => () => request.current?.abort(), [])

  function start(mode: TrainingMode) {
    const session: TrainingSession = { mode, topic, level, turns: [] }
    setSaved((previous) => ({ ...previous, draft: '', session: { ...session, pendingId: nextTrainingQuestion(session).question?.id } }))
    setError('')
    setModel('')
  }

  async function send(intent: 'answer' | 'finish') {
    if (!session || request.current || !consent || (intent === 'answer' && (!question || !draft.trim()))) return
    const operation = new AbortController()
    request.current = operation
    setBusy(true)
    setError('')
    try {
      const data = await sendStudyRequest('/api/assistant/training', {
        accountId, provider, consent: provider, eco, intent, session, ...(intent === 'answer' ? { answer: draft } : {}),
      }, operation.signal)
      if (operation.signal.aborted) return
      const result = intent === 'answer' ? parseTrainingFeedback(data.result) : parseTrainingReport(data.result)
      if (!result) throw new Error('O provedor devolveu feedback incompleto.')
      const metadata = parseGenerationMetadata(data.metadata)
      setModel(metadata?.model ?? '')
      if ('adaptation' in result && question) {
        setSaved((previous) => ({ ...previous, draft: '', session: {
          ...session, pendingId: undefined, turns: [...session.turns, { questionId: question.id, answer: draft.trim(), ...result }],
        } }))
      } else if ('strengths' in result) {
        setSaved((previous) => ({ ...previous, draft: '', session: { ...session, pendingId: undefined, report: result } }))
      }
    } catch (failure) {
      if (!operation.signal.aborted) setError(failure instanceof Error ? failure.message : 'Não foi possível gerar feedback.')
    } finally {
      request.current = null
      setBusy(false)
    }
  }

  return (
    <section className="oa-training" aria-label="Treino interativo">
      <header><MessagesSquare aria-hidden="true" /><h2>{session?.mode === 'interview' ? 'Entrevista técnica' : session ? 'Testar conhecimento' : 'Treino interativo'}</h2></header>
      {!session ? <>
        <p>Responda uma pergunta por vez e use o feedback para decidir o que praticar em seguida.</p>
        <div className="oa-training-controls">
          <label>Competência <select value={topic} onChange={(event) => { if (isTrainingTopic(event.target.value)) setTopic(event.target.value) }}>
            {Object.entries(trainingTopics).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select></label>
          <label>Nível inicial <select value={level} onChange={(event) => setLevel(event.target.value === '2' ? 2 : 1)}>
            <option value={1}>Estágio</option><option value={2}>Júnior</option>
          </select></label>
        </div>
        <div className="oa-training-controls">
          <button className="oa-button oa-primary" onClick={() => start('quiz')}><Blocks size={16} aria-hidden="true" /> Testar conhecimento</button>
          <button className="oa-button" onClick={() => start('interview')}>Simular entrevista</button>
        </div>
      </> : <>
        <p>{trainingTopics[session.topic]} · {session.turns.length} respondida(s) nesta sessão</p>
        {session.turns.length > 0 && <details><summary>Histórico da sessão</summary>
          <ol>{session.turns.map((turn) => <li key={turn.questionId}>
            <strong>{trainingQuestion(turn.questionId, session.topic)?.text}</strong>
            <p>{turn.answer}</p><p>{turn.feedback}</p>
          </li>)}</ol>
        </details>}
        {session.report ? <section className="oa-training-card"><h3>Relatório formativo da entrevista</h3>
          <dl><dt>Pontos fortes</dt><dd>{session.report.strengths}</dd><dt>Lacunas</dt><dd>{session.report.gaps}</dd>
            <dt>Próximos estudos</dt><dd>{session.report.nextSteps}</dd></dl>
          <p>Impressões da IA sobre as respostas desta sessão.</p>
        </section> : <>
          {question ? <form className="oa-training-card" onSubmit={(event) => { event.preventDefault(); void send('answer') }}>
            <label htmlFor="training-answer">{question.text}</label>
            <textarea id="training-answer" value={draft} disabled={busy} maxLength={trainingAnswerLimit} rows={4}
              onChange={(event) => setSaved((previous) => ({ ...previous, draft: event.target.value }))} />
            <button className="oa-button oa-primary" disabled={busy || !consent || !draft.trim()}>Enviar resposta</button>
          </form> : session.turns.length > 0 && <section className="oa-training-card"><h3>Feedback da última resposta</h3>
            <p>{session.turns.at(-1)?.feedback}</p>
            {next?.question ? <button className="oa-button" disabled={busy} onClick={() => setSaved((previous) => ({
              ...previous, session: { ...session, level: next.level, pendingId: next.question?.id },
            }))}>Outra pergunta</button> : <p>Você chegou ao fim das perguntas desta sessão.</p>}
          </section>}
          <div className="oa-training-controls">
            <label>Provedor <select value={provider} disabled={busy} onChange={(event) => {
              const selected = event.target.value
              if (isAssistantProvider(selected)) { setSaved((previous) => ({ ...previous, provider: selected })); setConsent(false) }
            }}>{assistantProviderIds.map((id) => <option key={id} value={id}>{assistantProviders[id]}</option>)}</select></label>
            <label><input type="checkbox" checked={consent} disabled={busy} onChange={(event) => setConsent(event.target.checked)} />
              {' '}Autorizar feedback de {assistantProviders[provider]} com minhas respostas</label>
          </div>
          {session.mode === 'interview' && session.turns.length > 0 && <button className="oa-button" disabled={busy || !consent}
            onClick={() => void send('finish')}>Encerrar e gerar relatório</button>}
        </>}
        {busy && <p role="status">Gerando com {assistantProviders[provider]}…</p>}
        {model && <p>Modelo utilizado: {model}</p>}
        {error && <p role="alert" className="oa-error">{error}</p>}
        <button className="oa-button" disabled={busy} onClick={() => {
          if (window.confirm('Começar uma nova sessão substitui este treino neste navegador. Continuar?')) {
            setSaved((previous) => ({ ...previous, session: null, draft: '' }))
            setConsent(false)
            setError('')
          }
        }}>Nova sessão</button>
      </>}
    </section>
  )
}
