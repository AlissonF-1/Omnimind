'use client'

import { useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, CircleAlert, Lightbulb } from '@/components/icons'
import { recordAcademyActivity } from '@/actions/academy'
import type { AcademyResource, GradedExercise, LessonRef } from '@/lib/academy/contracts'
import { ActivityInput, activityAnswer, initialResponse } from './ActivityInput'
import { ExerciseResource } from './ExerciseResource'
import { InlineCode } from './InlineCode'

export function StartLesson({ lesson, started, continueHref }: { lesson: LessonRef; started: boolean; continueHref: string }) {
  const [state, setState] = useState(started ? 'started' : 'idle')
  async function start() {
    setState('saving')
    try {
      const result = await recordAcademyActivity(lesson, 'start')
      setState('error' in result ? 'error' : 'started')
    } catch { setState('error') }
  }
  if (started || state === 'started') return <Link href={continueHref} className="ac3-button ac3-primary" prefetch={false}>Continuar aula</Link>
  return <div className="ac3-actions ac3-start"><button className="ac3-primary" onClick={start} disabled={state === 'saving'}>
    {state === 'saving' ? 'Salvando…' : 'Iniciar aula'}</button>{state === 'error' && <span role="alert">Não foi possível iniciar.</span>}</div>
}

export function LessonPractice({ exercise, lesson, resource, alreadyPassed = false, review = false, activityLabel, title }: {
  exercise: GradedExercise; lesson: LessonRef; resource?: AcademyResource; alreadyPassed?: boolean; review?: boolean
  activityLabel: string; title: string
}) {
  const [value, setValue] = useState(() => initialResponse(exercise))
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<{ text: string; correct?: boolean; error?: boolean } | null>(null)
  const [hints, setHints] = useState(0)
  const request = useRef<{ answer: string; id: string } | null>(null)
  const router = useRouter()
  const done = alreadyPassed || outcome?.correct
  const answer = activityAnswer(exercise, value)
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || done || answer === null) return
    setPending(true)
    const entry = request.current?.answer === answer ? request.current : { answer, id: crypto.randomUUID() }
    request.current = entry
    try {
      const result = await recordAcademyActivity(lesson, review ? 'review' : 'answer',
        { exercise: exercise.id, answer, requestId: entry.id })
      if ('error' in result) { setOutcome({ text: result.error, error: true }); return }
      request.current = null
      setOutcome({ text: result.feedback ?? '', correct: result.correct })
      if (result.correct) router.refresh()
    } catch { setOutcome({ text: 'Falha de conexão. Tente enviar a mesma resposta novamente.', error: true }) }
    finally { setPending(false) }
  }
  return <form className="ac-exercise ac3-exercise" data-kind={exercise.kind} data-listening={resource?.type === 'audio'} onSubmit={send}>
    <header className="ac-exercise-heading">
      <span className="ac-state" data-tone="current">{activityLabel}</span>
      <h3>{resource?.type === 'audio' ? 'Compreensão auditiva' : title}</h3>
      {exercise.phase === 'challenge' && <small>Desafio independente</small>}
    </header>
    <h2 className="ac-exercise-prompt" id={`ac-prompt-${exercise.id}`}><InlineCode text={exercise.prompt} /></h2>
    <ExerciseResource resource={resource} />
    {done ? <div className="ac-answer-feedback ac-success ac3-feedback" role="status"><CheckCircle2 size={21} aria-hidden="true" />
      <div><strong>Resposta correta</strong><p>{outcome?.text || 'Resposta correta registrada.'}</p></div>
    </div> : <>
      <ActivityInput exercise={exercise} value={value} onChange={setValue} disabled={pending} />
      <div className="ac3-actions">
        <button type="submit" className="ac3-primary" disabled={pending || answer === null}>{pending ? 'Corrigindo…' : 'Verificar resposta'}</button>
        {hints < exercise.hints.length && <button type="button" className="ac3-ghost" onClick={() => setHints((n) => n + 1)}>
          <Lightbulb size={15} aria-hidden="true" /> Pedir dica</button>}
      </div>
      {hints > 0 && <ol className="ac-hints">{exercise.hints.slice(0, hints).map((hint) => <li key={hint}><InlineCode text={hint} /></li>)}</ol>}
      {outcome && <div className={'ac-answer-feedback ac3-feedback ac3-bad ' + (outcome.error ? 'ac-error' : 'ac-retry')} role="status">
        <CircleAlert size={21} aria-hidden="true" /><div><strong>{outcome.error ? 'Falha no envio' : 'Tente novamente'}</strong><p>{outcome.text}</p></div>
      </div>}
    </>}
  </form>
}
