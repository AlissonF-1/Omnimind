'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, CircleCheck, CircleX, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { submitQuestionAnswer } from '@/actions/questions'
import { answerSubmission } from '@/lib/questions/practice'
import type { QuestionActionError, QuestionAnswerInput, QuestionAttemptFeedback } from '@/lib/questions/contracts'
import type { PracticeOption, PracticeQuestion } from '@/lib/questions/server'
import SqlCode from './SqlCode'

const answerMessages: Record<QuestionActionError, string> = {
  UNAUTHENTICATED: 'Sua sessão expirou. Entre novamente para continuar.',
  INVALID_INPUT: 'Esta alternativa não está disponível. Abra a questão pelo catálogo novamente.',
  REQUEST_CONFLICT: 'Este envio já está associado a outra resposta. Confira o histórico.',
  ATTEMPT_NOT_FOUND: 'A tentativa não foi encontrada. Tente novamente.',
  UNAVAILABLE: 'Não foi possível confirmar sua resposta. Tente novamente com a mesma alternativa.',
}

export function QuestionFeedback({ feedback }: { feedback: QuestionAttemptFeedback }) {
  const statusRef = useRef<HTMLDivElement>(null)
  const StatusIcon = feedback.isCorrect ? CircleCheck : CircleX
  const correctFirst = [...feedback.options].sort((a, b) =>
    Number(b.optionId === feedback.correctOptionId) - Number(a.optionId === feedback.correctOptionId),
  )

  useEffect(() => { statusRef.current?.focus() }, [])

  return (
    <section aria-labelledby="answer-explanations" className="q-panel q-pad q-feedback">
      <div ref={statusRef} tabIndex={-1} className={feedback.isCorrect ? 'q-result' : 'q-result q-negative'}>
        <StatusIcon size={27} className="shrink-0" aria-hidden="true" />
        <span className="q-result-label">{feedback.isCorrect ? 'Resposta correta!' : 'Resposta incorreta'}</span>
      </div>
      <h2 id="answer-explanations" className="q-section-title">Entenda as alternativas</h2>
      <ul className="q-explanations">
        {correctFirst.map((option) => {
          const correct = option.optionId === feedback.correctOptionId
          const selected = option.optionId === feedback.selectedOptionId
          return (
            <li key={option.optionId} className={correct ? 'q-explanation q-featured' : 'q-explanation'}>
              <span className="q-option-letter" aria-hidden="true">{String.fromCharCode(64 + option.position)}</span>
              <div className="min-w-0">
                <p className={correct ? 'q-positive font-semibold' : 'font-semibold'}>Alternativa {String.fromCharCode(64 + option.position)}{correct ? ' · Correta' : ' · Incorreta'}{selected && ' · Sua resposta'}</p>
                <p>{option.explanation}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default function QuestionPractice({ question, options, topic, position, total, nextHref, backHref, finishHref }: {
  question: PracticeQuestion
  options: PracticeOption[]
  topic: string | undefined
  position: number
  total: number
  nextHref: string | null
  backHref: string
  finishHref: string
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [locked, setLocked] = useState(false)
  const [error, setError] = useState<QuestionActionError | null>(null)
  const [feedback, setFeedback] = useState<QuestionAttemptFeedback | null>(null)
  const submission = useRef<QuestionAnswerInput | null>(null)
  const inFlight = useRef(false)
  const terminalError = error === 'UNAUTHENTICATED' || error === 'INVALID_INPUT' || error === 'REQUEST_CONFLICT'

  async function confirmAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || inFlight.current || feedback || terminalError) return

    inFlight.current = true
    setPending(true)
    setError(null)
    try {
      const input = answerSubmission(submission.current, question.id, selected, () => crypto.randomUUID())
      submission.current = input
      setLocked(true)
      const result = await submitQuestionAnswer(input)
      if (result.ok) setFeedback(result.feedback)
      else setError(result.error)
    } catch {
      setError('UNAVAILABLE')
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  const statement = question.statement.includes('`') ? question.statement : question.statement.replace(
    /(\bConsidere |\bpor )((?:SELECT|WHERE)\s+.+?)(?=\?|\.\s+Se\b)/,
    (_, prefix: string, code: string) => `${prefix}\`${code}\``,
  )

  return (
    <div className="q-shell q-stack q-practice">
      <Link href={backHref} prefetch={false} className="q-button q-back"><ArrowLeft size={16} aria-hidden="true" /> {backHref.includes('/historico') ? 'Histórico' : 'Questões'}</Link>

      <div className="q-practice-layout">
        <header className="q-panel q-sequence">
          <p className="q-eyebrow">Sequência</p>
          <p className="q-section-title mt-1 tabular-nums">Questão {position} de {total}</p>
          <progress aria-label={`Questão ${position} de ${total}`} value={position} max={total} className="q-progress" />
        </header>

        <div className="q-work">
          <form onSubmit={confirmAnswer} aria-busy={pending} className="q-panel q-pad">
            <p className="q-eyebrow mb-2">{topic ?? 'Prática de SQL'}</p>
            <h1 className="q-section-title">Enunciado</h1>
            <div className="q-statement">
              <ReactMarkdown skipHtml unwrapDisallowed allowedElements={['p', 'pre', 'code', 'em', 'strong', 'ul', 'ol', 'li', 'br', 'blockquote']} components={{
                code: ({ children }) => <SqlCode>{children}</SqlCode>,
              }}>{statement}</ReactMarkdown>
            </div>

            <fieldset disabled={locked || pending} className="q-options">
              <legend>Escolha uma alternativa</legend>
              {options.map((option) => {
                const marked = selected === option.id
                const revealedCorrect = feedback?.correctOptionId === option.id
                const tone = revealedCorrect ? 'q-option-right' : marked ? (feedback ? 'q-option-wrong' : 'q-option-marked') : ''
                return (
                  <label key={option.id} className="q-option-label">
                    <input className="sr-only" type="radio" name="question-answer" value={option.id} checked={marked} onChange={() => setSelected(option.id)} />
                    <span className={'q-option ' + tone}>
                      <span className="q-option-letter">{String.fromCharCode(64 + option.position)}</span>
                      {/^(SELECT|WHERE|WITH)\b/i.test(option.body.trim()) ? (
                        <SqlCode className="q-option-text">{option.body}</SqlCode>
                      ) : (
                        <span className="q-option-text text-sm">{option.body}</span>
                      )}
                      {revealedCorrect && <Check size={18} className="q-positive shrink-0" aria-label="Alternativa correta" />}
                      {marked && feedback && !revealedCorrect && <CircleX size={18} className="q-negative shrink-0" aria-label="Alternativa incorreta selecionada" />}
                    </span>
                  </label>
                )
              })}
            </fieldset>

            {error && <p role="alert" className="q-negative mt-4 text-sm">{answerMessages[error]} {error === 'UNAUTHENTICATED' && <Link href="/login" className="font-semibold underline">Entrar</Link>}</p>}

            {!feedback && (
              <div className="q-answer-footer">
                <button type="submit" disabled={!selected || pending || terminalError} className="q-button q-button-primary">
                  {pending && <Loader2 size={16} className="motion-safe:animate-spin" aria-hidden="true" />}
                  {pending ? 'Confirmando…' : error && !terminalError ? 'Tentar novamente' : 'Confirmar resposta'}
                </button>
              </div>
            )}
          </form>

          {feedback && (
            <>
              <QuestionFeedback feedback={feedback} />
              <div className="q-answer-footer !mt-0">
                <Link href={nextHref ?? finishHref} prefetch={false} className="q-button q-button-primary">
                  {nextHref ? 'Próxima questão' : 'Ver histórico'}<ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
