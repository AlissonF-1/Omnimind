import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, Clock3 } from '@/components/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AcademyHero, AcademyMentorPanel, AcademyPanel, AcademyStatus, Meter } from './AcademyVisual'
import { LessonDialogue, LessonVocabulary } from './EnglishStudio'
import { LabLauncher } from './LabLauncher'
import { LessonAnchorCompatibility } from './LessonAnchorCompatibility'
import { ExerciseResource } from './ExerciseResource'
import { InlineCode } from './InlineCode'
import { LessonPractice, StartLesson } from './LessonPractice'
import { VariableVisualizer } from './VariableVisualizer'
import { academyLessonHref, academySlug, availableLesson, isGradedExercise, type GradedExercise, type QuestionLinks } from '@/lib/academy/contracts'
import { academyExploreHref, formationLabels, journeyPath, skillsPath } from '@/lib/academy/presentation'
import { splitLessonSections } from '@/lib/academy/reading'
import { practiceHref } from '@/lib/academy/practice'
import { getAcademyLesson } from '@/lib/academy/server'

const activityLabels = {
  text: 'Resposta curta', 'multiple-choice': 'Múltipla escolha', ordering: 'Ordenação', parsons: 'Monte o código',
  matching: 'Associação', output: 'Preveja a saída', trace: 'Rastreie os valores', 'fill-in': 'Complete as lacunas',
  'question-set': 'Questões',
}

export type LessonPageProps = {
  params: Promise<{ release: string; lesson: string }>
  searchParams: Promise<{ revisao?: string | string[]; atividade?: string | string[]; etapa?: string | string[]; secao?: string | string[] }>
}

export async function AcademyLessonScreen({ params, searchParams }: LessonPageProps) {
  const [{ release: releaseId, lesson: lessonId }, query] = await Promise.all([params, searchParams])
  if (!academySlug.test(releaseId) || !academySlug.test(lessonId)) notFound()
  const data = await getAcademyLesson(releaseId, lessonId)
  if (!data) notFound()
  const { release, formation, lesson, progress, passed, now, userId } = data
  const english = formation.kind === 'english'
  const isReview = query.revisao === '1'
  const completed = new Set(progress.filter((item) => item.completed_at).map((item) => item.lesson_id))
  const allLessons = release.catalog.formations.flatMap((item) => item.chapters.flatMap((chapter) => chapter.lessons))
  const chapterIndex = formation.chapters.findIndex(({ lessons }) => lessons.some(({ id }) => id === lesson.id))
  const chapter = formation.chapters[chapterIndex]
  const path = formation.chapters.flatMap((entry) => entry.lessons)
  const lessonIndex = path.findIndex(({ id }) => id === lesson.id)
  const selection = { release: releaseId, form: formation.id, track: formation.kind }
  const journey = academyExploreHref(journeyPath, selection, chapter ? { capitulo: chapter.id, missao: lesson.id } : {})

  if (!availableLesson(lesson, completed)) return <div className={english ? 'ac3-english' : undefined}>
    <AcademyHero title={lesson.title} eyebrow="Aula bloqueada" scene={english ? 'english' : 'programming'} pose="thinking"
      actions={<Link className="ac3-button" href={journey}><ArrowLeft size={15} /> Voltar à jornada</Link>} />
    <AcademyPanel title="Pré-requisitos pendentes">
      <ul className="ac3-inline-links">{lesson.prerequisites.filter((id) => !completed.has(id)).map((id) =>
        <li key={id}><Link href={academyLessonHref(release.id, id)}>{allLessons.find((item) => item.id === id)?.title ?? id}</Link></li>)}</ul>
    </AcademyPanel>
  </div>

  const ref = { release: release.id, version: release.version, lesson: lesson.id }
  const state = progress.find((row) => row.lesson_id === lesson.id)
  const due = Boolean(state?.review_due_at && Date.parse(state.review_due_at) <= now)
  const graded = lesson.exercises.filter(isGradedExercise)
  const required = graded.filter((exercise) => exercise.phase !== 'review')
  const activities = isReview ? graded.filter((exercise) => exercise.phase === 'review') :
    lesson.exercises.filter((exercise): exercise is GradedExercise | QuestionLinks =>
      exercise.kind === 'question-set' || (isGradedExercise(exercise) && exercise.phase !== 'review'))
  const activityIndex = Math.max(0, activities.findIndex((exercise) => exercise.id === query.atividade))
  const active = activities[activityIndex]
  const upcoming = activities[activityIndex + 1]
  const skills = release.catalog.competencies.filter((skill) => lesson.competencies.includes(skill.id))
  const next = path[lessonIndex + 1]
  const resources = new Map(release.catalog.resources.map((item) => [item.id, item]))
  const challenges = lesson.exercises.filter((exercise) => exercise.kind === 'python').map((exercise, index) => ({
    id: exercise.id, label: 'Desafio ' + (index + 1) + ' · ' + exercise.prompt.slice(0, 70),
    resource: exercise.resource ? resources.get(exercise.resource) : undefined,
  }))
  const verified = required.filter(({ id }) => passed.includes(id)).length
  const tabs = [
    { id: 'aprender', label: 'Aprender' },
    ...(lesson.visual || challenges.length ? [{ id: 'experimentar', label: 'Experimentar' }] : []),
    ...(lesson.dialogue?.length ? [{ id: 'escutar', label: 'Escutar' }] : []),
    ...(lesson.vocabulary?.length ? [{ id: 'expressoes', label: 'Expressões' }] : []),
    ...(active ? [{ id: 'praticar', label: isReview ? 'Revisar' : 'Praticar' }] : []),
    { id: 'aplicacao', label: 'Aplicação' },
  ]
  const currentTab = tabs.find(({ id }) => id === query.etapa)?.id
    ?? ((isReview || query.atividade) && active ? 'praticar' : 'aprender')
  const readSections = splitLessonSections(lesson.lessonMarkdown)
  const requestedSection = typeof query.secao === 'string' ? Number(query.secao) : 1
  const sectionIndex = Number.isSafeInteger(requestedSection) ? Math.max(0, Math.min(readSections.length - 1, requestedSection - 1)) : 0
  const section = readSections[sectionIndex]
  const lessonUrl = academyLessonHref(release.id, lesson.id)
  function tabHref(tab: string, extra: Record<string, string> = {}) {
    return lessonUrl + '?' + new URLSearchParams({ ...(isReview ? { revisao: '1' } : {}), etapa: tab, ...extra })
  }
  const activityHref = (id: string) => tabHref('praticar', { atividade: id })
  const readHref = (number: number) => tabHref('aprender', { secao: String(number) })
  const publicScene = lesson.title.toLowerCase().includes('boss battle') ? 'boss-battle' : english ? 'english' : 'programming'
  const artPose = currentTab === 'experimentar' && challenges.length ? 'debugging' : english ? 'listening' : 'teaching'
  const resource = active?.resource ? resources.get(active.resource) : undefined
  const resumeHref = currentTab === 'aprender' ? '#conteudo-aula' : readHref(1)
  const standaloneLab = currentTab === 'experimentar' && challenges.length > 0

  return <article className={english ? 'ac3-english' : undefined} data-ac3-lesson-track={formation.kind}>
    <LessonAnchorCompatibility tabs={tabs.map(({ id }) => id)} />
    {!standaloneLab && <div className="ac3-splitbar">
      <Link className="ac3-button ac3-ghost" href={journey} prefetch={false}><ArrowLeft size={15} aria-hidden="true" /> Jornada</Link>
      <span className="ac3-eyebrow">{formationLabels[formation.kind]}{chapter && ' / Capítulo ' + (chapterIndex + 1)} / Aula {lessonIndex + 1}</span>
    </div>}
    <AcademyHero title={lesson.title} description={lesson.summary} scene={publicScene} pose={artPose}
      eyebrow={isReview ? 'Revisão da aula' : currentTab === 'experimentar' && challenges.length ? 'Laboratório Python' : 'Aula ' + String(lessonIndex + 1).padStart(2, '0')}
      actions={standaloneLab ? <Link className="ac3-button" href={readHref(1)} prefetch={false}>Voltar à aula</Link> :
        <><span className="ac3-badge"><Clock3 size={13} aria-hidden="true" /> {lesson.minutes} min</span>
        {isReview ? <Link className="ac3-button" href={lessonUrl}>Voltar à aula</Link> :
          <StartLesson lesson={ref} started={Boolean(state)} continueHref={resumeHref} />}
        {!isReview && <Link className="ac3-button" href={practiceHref({lesson:release.id+'/'+lesson.id})} prefetch={false}>Prática complementar</Link>}
      </>} />
    <div className={standaloneLab ? 'ac3-grid2' : 'ac3-lessonlayout'}>
      <div className="ac3-lessonbody">
        {!standaloneLab && <nav className="ac3-tabs" aria-label="Etapas da aula">{tabs.map(({ id, label }) =>
          <Link key={id} className={'ac3-button' + (id === currentTab ? ' ac3-selected' : '')}
            href={tabHref(id, id === 'praticar' && active ? { atividade: active.id } : {})}
            prefetch={false} scroll={false} aria-current={id === currentTab ? 'page' : undefined}>{label}</Link>)}</nav>}

        {currentTab === 'aprender' && <div className="ac3-panel ac3-readgrid" id="conteudo-aula">
          <nav className="ac3-outline" aria-label="Seções da leitura">{readSections.map((entry, index) =>
            <Link key={index} href={readHref(index + 1)} className={'ac3-button' + (index === sectionIndex ? ' ac3-selected' : '')}
              prefetch={false} scroll={false} aria-current={index === sectionIndex ? 'step' : undefined}>{entry.title}</Link>)}</nav>
          <section className="ac3-reading">
            <span className="ac3-eyebrow">Etapa {sectionIndex + 1} de {readSections.length}</span><h2>{section.title}</h2>
            <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} disallowedElements={['img', 'a', 'input']} unwrapDisallowed
              components={{ table: ({ children }) => <div className="ac-prose-table" role="region" tabIndex={0} aria-label="Tabela da aula"><table>{children}</table></div>,
                pre: ({ children }) => <pre tabIndex={0}>{children}</pre> }}>{section.markdown}</ReactMarkdown>
            {sectionIndex === 0 && lesson.resources.map((id) => <ExerciseResource key={id} resource={resources.get(id)} />)}
            <div className="ac3-lessonnav">
              {sectionIndex > 0 ? <Link className="ac3-button" href={readHref(sectionIndex)} prefetch={false} scroll={false}><ArrowLeft size={15} /> Anterior</Link> : <span />}
              {sectionIndex + 1 < readSections.length ? <Link className="ac3-button ac3-primary" href={readHref(sectionIndex + 2)} prefetch={false} scroll={false}>
                Continuar <ArrowRight size={15} /></Link> : active && <Link className="ac3-button ac3-primary" href={activityHref(active.id)} prefetch={false} scroll={false}>Ir à prática <ArrowRight size={15} /></Link>}
            </div>
          </section>
        </div>}
        {currentTab === 'experimentar' && <div className={lesson.visual && challenges.length ? 'ac3-labgrid' : 'ac3-stack'}>
          {lesson.visual && <VariableVisualizer key={lesson.id} visual={lesson.visual} />}
          {!!challenges.length && <LabLauncher key={userId + ':' + release.id + ':' + release.version + ':' + lesson.id}
            challenges={challenges} lesson={ref} account={userId} />}
        </div>}
        {standaloneLab && active && <AcademyPanel title="Pratique a lógica">
          <p>Use as atividades da aula para comparar o que você previu com o resultado da execução.</p>
          <Link className="ac3-linkbtn" href={activityHref(active.id)} prefetch={false}>Abrir exercícios <ArrowRight size={14} /></Link>
        </AcademyPanel>}
        {currentTab === 'escutar' && <LessonDialogue dialogue={lesson.dialogue ?? []} resources={resources} />}
        {currentTab === 'expressoes' && <LessonVocabulary words={lesson.vocabulary ?? []} resources={resources} lesson={ref} />}
        {currentTab === 'aplicacao' && <AcademyPanel title="Onde isso aparece no trabalho"><p><InlineCode text={lesson.application} /></p></AcademyPanel>}
        {currentTab === 'praticar' && active && <AcademyPanel title={isReview ? 'Recupere o que aprendeu' : 'Pratique o que aprendeu'}
          action={<span className="ac3-badge">{activityIndex + 1}/{activities.length}</span>}>
          {activities.length > 1 && <nav className="ac3-tabs" aria-label="Atividades da aula">
            {activities.map((exercise, index) => <Link key={exercise.id}
              className={'ac3-button' + (exercise.id === active.id ? ' ac3-selected' : '')} href={activityHref(exercise.id)}
              prefetch={false} scroll={false} aria-current={exercise.id === active.id ? 'step' : undefined}>
              {String(index + 1).padStart(2, '0')} · {activityLabels[exercise.kind]}{passed.includes(exercise.id) && <span className="sr-only"> · Concluída</span>}
            </Link>)}
          </nav>}
          {isReview && !due ? <p>{state?.review_count ? 'Revisão registrada. A próxima sessão aparece quando estiver disponível.' : 'Esta revisão ainda não está disponível.'}</p> :
            isGradedExercise(active) ? <LessonPractice key={release.version + ':' + active.id} exercise={active} lesson={ref}
              resource={resource} alreadyPassed={!isReview && passed.includes(active.id)} review={isReview}
              activityLabel={isReview ? 'Revisão' : 'Atividade ' + (activityIndex + 1) + ' de ' + activities.length} title={activityLabels[active.kind]} /> :
              <div className="ac3-exercise"><strong><InlineCode text={active.prompt} /></strong><ExerciseResource resource={resource} />
                <ul className="ac3-inline-links">{active.versionIds.map((id, index) => <li key={id}>
                  <Link href={'/dashboard/questoes/resolver?versao=' + id}>Abrir questão {index + 1}</Link></li>)}</ul></div>}
          {upcoming && <div className="ac3-lessonnav"><small>{verified} atividades verificadas</small>
            <Link className="ac3-button" href={activityHref(upcoming.id)} prefetch={false} scroll={false}>Próxima atividade <ArrowRight size={15} /></Link>
          </div>}
        </AcademyPanel>}
      </div>

      <aside className="ac3-stack" aria-label="Apoio à aula">
        {!standaloneLab && <AcademyPanel title="Objetivos da aula">
          <ul className="ac3-objectives">{lesson.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul>
        </AcademyPanel>}
        <AcademyMentorPanel pose={english ? 'listening' : currentTab === 'experimentar' ? 'debugging' : 'hint'}>
          <p>{english ? 'Ouça a frase, repita em voz alta e depois confira a tradução.' :
            currentTab === 'experimentar' ? 'Compare o comportamento observado com o que você esperava antes de executar.' :
              'Avance por uma etapa de cada vez. Use os exemplos para testar seu entendimento.'}</p>
          <Link className="ac3-linkbtn" href={'/dashboard/assistente?academyRelease=' + release.id + '&academyLesson=' + lesson.id}
            prefetch={false}>Perguntar ao mentor <ArrowRight size={13} /></Link>
        </AcademyMentorPanel>
        {standaloneLab ? <AcademyPanel title="Segurança e execução">
          <p>O Skulpt executa o código em um ambiente isolado no navegador. Os casos exibidos são exemplos públicos de prática.</p>
        </AcademyPanel> : <AcademyPanel title="Estado da missão">
          <AcademyStatus label={state?.completed_at ? 'Aula concluída' : state ? 'Em andamento' : 'Disponível'}
            tone={state?.completed_at ? 'complete' : state ? 'current' : 'available'} />
          <Meter value={verified} total={required.length} label="Atividades verificadas" /><small>{verified} de {required.length} atividades verificadas</small>
          {due && !isReview && <Link className="ac3-linkbtn" href={academyLessonHref(release.id, lesson.id, true)} prefetch={false}>Revisar esta aula <ArrowRight size={14} /></Link>}
          {state?.completed_at && next && availableLesson(next, completed) && <Link className="ac3-linkbtn" href={academyLessonHref(release.id, next.id)} prefetch={false}>Próxima aula <ArrowRight size={14} /></Link>}
          {!!skills.length && <details className="ac3-lesson-skills"><summary>Competências desta aula</summary>
            <ul className="ac3-inline-links">{skills.map((skill) => <li key={skill.id}><Link
              href={academyExploreHref(skillsPath, selection, { competencia: skill.id })} prefetch={false}>{skill.title}</Link></li>)}</ul>
          </details>}
        </AcademyPanel>}
      </aside>
    </div>
  </article>
}
