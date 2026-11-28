import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import { ArrowLeft, CircleAlert, ClipboardCheck, Trophy } from '@/components/icons'
import {
  beginLearningStepAction, confirmLearningReadingAction, deliverLearningChallengeAction,
  gradeLearningChallengeAction, restartLearningAssessmentAction, submitLearningAnswerAction,
} from '@/actions/learning'
import QuestionPractice from '@/components/questions/QuestionPractice'
import SqlCode from '@/components/questions/SqlCode'
import { learningHref, learningQuestionHref, learningStepStatus, type LearningProgress } from '@/lib/learning/progress'
import { getLearningPractice, getLearningReviewQueue, type LearningPath, type LearningPracticeMistake, type LearningStep } from '@/lib/learning/server'
import type { getQuestionSession } from '@/lib/questions/server'
import { findSqlLabChallenge, sqlLabHref, sqlLabPath } from '@/lib/sql-lab/catalog'
import { ChallengeDeliveryForm, ChallengeReviewForm, LearningActionForm } from './LearningForms'
import { learningKindLabel } from './LearningPresentation'
import { LearningTutorActions, LearningTutorButton, type LearningTutorScope } from './LearningTutorActions'

type Session = Awaited<ReturnType<typeof getQuestionSession>>

function tutorScope(path: LearningPath, step: LearningStep): LearningTutorScope {
  return { pathId: path.id, stepId: step.id, label: { pathTitle: path.title, stepTitle: step.title, slug: path.slug } }
}

function SqlLabLink({ path, step }: { path: LearningPath; step: LearningStep }) {
  if (path.slug !== 'sql-concursos-e-mercado' || step.kind === 'assessment') return null
  const challenge = findSqlLabChallenge(step.topic)
  const href = challenge ? sqlLabHref(challenge.slug) + '?' + new URLSearchParams({ etapa: step.id }) : sqlLabPath
  return <Link className="lp-button" href={href} prefetch={false}>Praticar no Laboratório SQL</Link>
}

function Lesson({ text }: { text: string }) {
  return (
    <div className="lp-markdown">
      <ReactMarkdown skipHtml unwrapDisallowed allowedElements={['h2', 'h3', 'p', 'pre', 'code', 'strong', 'em', 'ol', 'ul', 'li', 'blockquote']}
        components={{ code: ({ children }) => <SqlCode>{children}</SqlCode> }}>
        {text}
      </ReactMarkdown>
    </div>
  )
}

function NextStep({ path, current, next }: { path: LearningPath; current: LearningStep; next: LearningStep | null }) {
  return next && next.position > current.position
    ? <LearningActionForm action={beginLearningStepAction.bind(null, path.slug, next.id)} label="Continuar aprendendo" primary />
    : <Link className="lp-button" href={learningHref(path.slug)} prefetch={false}>Ver roteiro da trilha</Link>
}

function Submission({ text, url }: { text: string | null; url: string | null }) {
  if (text) return <pre className="lp-submission">{text}</pre>
  if (url) return <a className="lp-external" href={url} target="_blank" rel="noopener noreferrer">Abrir repositório em nova aba</a>
  return null
}

function PracticeMistakes({ scope, mistakes }: { scope: LearningTutorScope; mistakes: LearningPracticeMistake[] }) {
  if (!mistakes.length) return null
  return (
    <section className="lp-panel lp-mistakes" aria-label="Erros desta prática">
      <h2>Rever erros desta prática</h2>
      <ul>
        {mistakes.map(({ attemptId, position }) => (
          <li key={attemptId}>Questão {position}<LearningTutorButton scope={scope} mode="explain-error" attemptId={attemptId} /></li>
        ))}
      </ul>
    </section>
  )
}

function PracticeOutcome({ path, step, next, practice }: {
  path: LearningPath; step: LearningStep; next: LearningStep | null
  practice: NonNullable<Awaited<ReturnType<typeof getLearningPractice>>>
}) {
  const { round, rounds } = practice
  const assessment = step.kind === 'assessment'
  return (
    <div className="lp-panel lp-activity lp-outcome">
      <div className="lp-outcome-heading">
        <span className="lp-outcome-icon">{round.passed ? <Trophy size={25} aria-hidden="true" /> : <CircleAlert size={25} aria-hidden="true" />}</span>
        <div><p className="lp-kicker">{assessment ? 'Desempenho na coleção praticada' : 'Prática realizada'}</p>
          <h2>{assessment ? (round.passed ? 'Avaliação aprovada' : 'Meta da avaliação ainda não atingida') : 'Prática concluída'}</h2></div>
      </div>
      <p className="lp-score"><strong>{round.correct}</strong> / {round.total} acertos</p>
      {assessment && <>
        <p className="lp-muted">A meta desta coleção é de {step.passing_score} acertos em {practice.total} questões.</p>
        <h3>Histórico de rodadas</h3>
        <ul className="lp-rounds">
          {rounds.filter((item) => item.finished_at).map((item) => <li key={item.round}>
            <strong>Rodada {item.round}</strong><span>{item.correct}/{item.total}</span><span className={'lp-flag' + (item.passed ? ' lp-done' : ' lp-open')}>{item.passed ? 'Aprovada' : 'Abaixo da meta'}</span>
          </li>)}
        </ul>
      </>}
      {assessment && !round.passed
        ? <LearningActionForm action={restartLearningAssessmentAction.bind(null, path.slug, step.id, round.round)} label="Iniciar nova rodada" primary />
        : <NextStep path={path} current={step} next={next} />}
      {!assessment && <><LearningTutorActions scope={tutorScope(path, step)} /><SqlLabLink path={path} step={step} /></>}
    </div>
  )
}

async function PracticeActivity({ session, enrollment, path, step, next }: {
  session: Session; enrollment: string; path: LearningPath; step: LearningStep; next: LearningStep | null
}) {
  const tutor = step.kind === 'practice' ? tutorScope(path, step) : undefined
  const practice = await getLearningPractice(session, enrollment, step.id, !!tutor)
  if (!practice) return (
    <div className="lp-panel lp-activity">
      <p>Não foi possível recuperar a rodada. Abra esta etapa novamente para continuar.</p>
      <LearningActionForm action={beginLearningStepAction.bind(null, path.slug, step.id)} label="Reabrir etapa" />
    </div>
  )
  const mistakes = tutor && <PracticeMistakes scope={tutor} mistakes={practice.mistakes} />
  if (practice.round.finished_at) return <><PracticeOutcome path={path} step={step} next={next} practice={practice} />{mistakes}</>
  if (!practice.question) return <div className="lp-panel lp-activity" role="status">A versão vinculada a esta etapa está indisponível.</div>
  const { version, options } = practice.question
  return (
    <>
      {step.kind === 'assessment' && <>
        <p className="lp-assessment-note">Rodada {practice.round.round} · Meta de {step.passing_score}/{practice.total} · Desempenho na coleção praticada</p>
        <p className="lp-muted lp-activity-assistant-notice">O Assistente fica indisponível enquanto houver uma avaliação aberta.</p>
      </>}
      {tutor && <><LearningTutorActions scope={tutor} /><SqlLabLink path={path} step={step} /></>}
      <div className="quest-module lp-question-module">
        <QuestionPractice key={version.id} question={version} options={options} topic={step.title}
          position={practice.position} total={practice.total} backHref={learningHref(path.slug)} backLabel="Roteiro"
          nextHref={practice.nextId ? learningQuestionHref(path.slug, step.id, practice.nextId) : null}
          finishHref={learningQuestionHref(path.slug, step.id)} finishLabel="Ver resultado"
          learningTutor={tutor}
          submitAnswerAction={submitLearningAnswerAction.bind(null, step.id, practice.round.round)} />
      </div>
      {mistakes}
    </>
  )
}

export async function LearningReview({ session, path, step }: { session: Session; path: LearningPath; step: LearningStep }) {
  const queue = await getLearningReviewQueue(session, step.id)
  const rubric = step.rubric ?? []
  return (
    <section className="lp-panel lp-activity">
      <h1>Avaliar entregas</h1>
      <p className="lp-muted">{step.title} · Indique se cada critério foi atendido. A aprovação exige atender à rubrica completa.</p>
      {queue.length === 0 ? <p className="lp-empty-message">Nenhuma entrega pendente.</p> : (
        <ul className="lp-review-list">
          {queue.map((entry) => (
            <li key={entry.enrollment_id} className="lp-review-entry">
              <h2>Entrega de <time dateTime={entry.submitted_at}>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(entry.submitted_at))}</time></h2>
              <Submission text={entry.submission_text} url={entry.submission_url} />
              <ChallengeReviewForm rubric={rubric}
                action={gradeLearningChallengeAction.bind(null, path.slug, step.id, entry.enrollment_id, rubric.length)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function LearningActivity({ session, enrollment, path, step, progress, next }: {
  session: Session; enrollment: string; path: LearningPath; step: LearningStep; progress: LearningProgress; next: LearningStep | null
}) {
  if (step.kind === 'practice' || step.kind === 'assessment') return (
    <section className="lp-activity-frame">
      <PracticeActivity session={session} enrollment={enrollment} path={path} step={step} next={next} />
    </section>
  )

  const verified = step.kind === 'reading' ? !!progress.completed_at : !!progress.challenge_approved
  return (
    <section className="lp-panel lp-activity">
      <Link className="lp-step-link w-fit" href={learningHref(path.slug)} prefetch={false}><ArrowLeft size={16} aria-hidden="true" /> Roteiro</Link>
      <header className="lp-activity-heading">
        <div><p className="lp-kicker">{learningKindLabel[step.kind]}</p><h1>{step.title}</h1></div>
        <span className={'lp-flag ' + (verified ? 'lp-done' : 'lp-open')}>{learningStepStatus(step.kind, progress)}</span>
      </header>
      <LearningTutorActions scope={tutorScope(path, step)} />
      <SqlLabLink path={path} step={step} />
      <Lesson text={step.body ?? ''} />
      {step.kind === 'reading' ? (
        progress.completed_at
          ? <NextStep path={path} current={step} next={next} />
          : <LearningActionForm action={confirmLearningReadingAction.bind(null, path.slug, step.id)} label="Confirmar leitura" primary />
      ) : (
        <>
          <section className="lp-rubric" aria-labelledby="lp-rubric-title">
            <h2 id="lp-rubric-title"><ClipboardCheck size={19} aria-hidden="true" /> Rubrica</h2>
            <ul>{step.rubric?.map((criterion, index) => <li key={criterion}>{criterion}
              {progress.review_checks && <span className={progress.review_checks[index] ? 'lp-positive' : 'lp-error-text'}>{progress.review_checks[index] ? 'Atendido' : 'Não atendido'}</span>}
            </li>)}</ul>
            <p className="lp-muted">A avaliação é manual. A entrega libera a avaliação final da trilha.</p>
          </section>
          {progress.submitted_at ? (
            <div className="lp-delivery">
              <h2>Sua entrega</h2>
              <Submission text={progress.submission_text} url={progress.submission_url} />
              <p className="lp-muted">{progress.reviewed_at ? (progress.challenge_approved ? 'Aprovada pela rubrica.' : 'Avaliada. A rubrica indica os critérios que faltaram.') : 'Enviada. Aguardando avaliação manual.'}</p>
              <NextStep path={path} current={step} next={next} />
            </div>
          ) : <ChallengeDeliveryForm action={deliverLearningChallengeAction.bind(null, path.slug, step.id)} />}
        </>
      )}
    </section>
  )
}
