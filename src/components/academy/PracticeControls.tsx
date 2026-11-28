'use client'

import { useRef, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowRight, CircleAlert, LabIcon, Lightbulb, Play } from '@/components/icons'
import { savePracticeCode, startPractice, submitPractice } from '@/actions/academy-practice'
import { outcomeLabel, practicePath, practiceSizes, type PracticeActivity, type PracticeFilters, type PracticeResult } from '@/lib/academy/practice'
import { ActivityInput, activityAnswer, initialResponse } from './ActivityInput'
import { InlineCode } from './InlineCode'

const PythonLab = dynamic(() => import('./PythonLab'),{ ssr:false,loading:() => <p role="status">Carregando o editor…</p> })

export function StartPractice({ account, filters, total, item, label }: {
  account: string; filters: PracticeFilters; total?: number; item?: string; label?: string
}) {
  const router = useRouter()
  const [pending,start] = useTransition()
  const [error,setError] = useState('')
  const [size,setSize] = useState<number>(5)
  const request = useRef<{ key: string; id: string } | null>(null)
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const key = JSON.stringify([filters,size,item])
    const id = request.current?.key === key ? request.current.id : crypto.randomUUID()
    request.current = { key,id }
    setError('')
    start(async () => {
      try {
        const result = await startPractice(account,filters,size,id,item)
        if ('error' in result) setError(result.error ?? 'Não foi possível iniciar.')
        else router.push(practicePath+'/'+result.sessionId)
      } catch { setError('Sem conexão para iniciar a sessão. Tente novamente.') }
    })
  }
  return <form className="ac-practice-start" onSubmit={submit}>
    {!item && <label>Questões por sessão<select value={size} onChange={(event) => setSize(Number(event.target.value))} disabled={pending}>
      {practiceSizes.map((count) => <option key={count} value={count}>{count}</option>)}
    </select></label>}
    <button className={item ? 'ac3-button' : 'ac3-button ac3-primary'} disabled={pending || total === 0}>
      {!item && <Play size={15} aria-hidden="true" />}{pending ? 'Abrindo…' : label ?? 'Iniciar sessão'}
    </button>
    {!item && <small>Esta sessão terá até {Math.min(size,total ?? 0)} atividades com os filtros atuais.</small>}
    {error && <p role="alert" className="ac-practice-error">{error}</p>}
  </form>
}

export function PracticeFeedback({ result, next }: { result: PracticeResult; next: string }) {
  const success = result.outcome !== 'incorrect'
  return <div className={success ? 'ac-answer-feedback ac-success ac3-feedback' : 'ac-answer-feedback ac3-feedback ac3-bad'} role="status">
    <strong>{outcomeLabel[result.outcome]}{result.credit !== null && result.credit > 0 && result.credit < 100 ? ` · ${result.credit}% dos pares` : ''}</strong>
    {result.feedback && <p>{result.feedback}</p>}
    <Link href={next} prefetch={false} className="ac3-button ac3-primary">Continuar <ArrowRight size={15} aria-hidden="true" /></Link>
  </div>
}

export function PracticeQuestion({ activity, draft, account, session, position, next }: {
  activity: PracticeActivity; draft: string | null; account: string; session: string; position: number; next: string
}) {
  const [value,setValue] = useState(() => activity.kind === 'python' ? '' : initialResponse(activity))
  const [code,setCode] = useState(() => draft ?? (activity.kind === 'python' ? activity.starter : ''))
  const [showLab,setShowLab] = useState(false)
  const [saveStatus,setSaveStatus] = useState(draft !== null ? 'Rascunho recuperado.' : 'Salve o rascunho para retomar mais tarde.')
  const [hints,setHints] = useState(0)
  const [result,setResult] = useState<PracticeResult | null>(null)
  const [error,setError] = useState('')
  const [pending,start] = useTransition()
  const request = useRef<{ answer: string; id: string } | null>(null)
  const answer = activity.kind === 'python' ? code : activityAnswer(activity,value)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || answer === null || result) return
    const id = request.current?.answer === answer ? request.current.id : crypto.randomUUID()
    request.current = { answer,id }
    setError('')
    start(async () => {
      try {
        const response = await submitPractice(account,session,position,id,answer)
        if ('error' in response) setError(response.error ?? 'Falha ao registrar a prática.')
        else setResult(response.result)
      } catch { setError('Sem conexão. Tente enviar a mesma resposta novamente.') }
    })
  }

  if (result) return <PracticeFeedback result={result} next={next} />
  return <form className="ac-exercise ac3-exercise ac-practice-question" onSubmit={submit}>
    <h2 className="ac-exercise-prompt" id={`ac-prompt-${activity.id}`}><InlineCode text={activity.prompt} /></h2>
    {activity.kind === 'python' ? (showLab ? <>
      <PythonLab exercise={activity} code={code} onChange={setCode} saveStatus={saveStatus} practiceMode />
      <div className="ac3-actions">
        <button type="button" className="ac3-button" disabled={pending} onClick={() => start(async () => {
          try {
            const response = await savePracticeCode(account,session,position,code)
            setSaveStatus(response.error ?? 'Rascunho salvo.')
          } catch { setSaveStatus('Falha de conexão ao salvar.') }
        })}>Salvar rascunho</button>
        <button type="submit" className="ac3-button ac3-primary" disabled={pending || !code.trim()}>{pending ? 'Salvando…' : 'Registrar prática'}</button>
      </div>
    </> : <button type="button" className="ac3-button ac3-primary" onClick={() => setShowLab(true)}><LabIcon size={19} aria-hidden="true" /> Abrir laboratório</button>) : <>
      {activity.kind === 'output' && <p><small>Preserve espaços e quebras internas. A quebra de linha final é opcional.</small></p>}
      {activity.kind === 'fill-in' && <p><small>Maiúsculas, minúsculas e espaços fazem parte da resposta.</small></p>}
      <ActivityInput exercise={activity} value={value} onChange={setValue} disabled={pending} multilineFields={activity.multilineFields} />
      <div className="ac3-actions">
        <button type="submit" className="ac3-button ac3-primary" disabled={pending || answer === null}>{pending ? 'Verificando…' : 'Verificar resposta'}</button>
        {hints < activity.hints.length && <button type="button" className="ac3-button" onClick={() => setHints((count) => count+1)}>
          <Lightbulb size={15} aria-hidden="true" /> Pedir dica</button>}
      </div>
      {hints > 0 && <ol className="ac-hints">{activity.hints.slice(0,hints).map((hint) => <li key={hint}><InlineCode text={hint} /></li>)}</ol>}
    </>}
    {error && <p role="alert" className="ac-practice-error"><CircleAlert size={16} aria-hidden="true" /> {error}</p>}
  </form>
}
