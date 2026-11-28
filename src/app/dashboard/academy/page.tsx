import Link from 'next/link'
import { ArrowRight, Play } from '@/components/icons'
import { AcademyEmpty, AcademyHero, AcademyMentorPanel, AcademyPanel, AcademyProgressPanel, KitArt, Meter } from '@/components/academy/AcademyVisual'
import { StudyGoal } from '@/components/academy/StudyGoal'
import { academyLessonHref, buildAcademyDashboardState } from '@/lib/academy/contracts'
import { academyExploreHref, formationArt, formationLabels, formationSelection, journeyPath } from '@/lib/academy/presentation'
import { AcademySchemaMissing, getAcademyHome } from '@/lib/academy/server'
import { practicePath } from '@/lib/academy/practice'

export default async function AcademyPage() {
  const home = await getAcademyHome().catch((error: unknown) => {
    if (error instanceof AcademySchemaMissing) return null
    throw error
  })
  if (!home) return <AcademyEmpty unavailable />
  const { items, next, count, total, due, market, archivedHistory } = buildAcademyDashboardState(home.releases, home.rows, home.now)
  if (!items.length) return <AcademyEmpty />
  const resumed = Boolean(next?.next && next.progress.has(next.next.id))
  const project = items.find(({ formation }) => formation.kind === 'tech' && /omnistock|projeto/i.test(formation.description))

  return <>
    <AcademyHero eyebrow="Sua central de aprendizagem" title={resumed || count ? 'Continue sua jornada' : 'Seu futuro começa aqui'}
      description="Programação, inglês e prática. Um passo de cada vez." scene="academy" pose="welcome"
      actions={<>
        {next?.next && <Link className="ac3-button ac3-primary" href={academyLessonHref(next.release.id, next.next.id)}>
          <Play size={14} aria-hidden="true" />{resumed ? 'Continuar estudando' : 'Começar a estudar'}
        </Link>}
        <Link className="ac3-button" href={journeyPath}>Explorar jornada</Link>
        <Link className="ac3-button" href={practicePath} prefetch={false}>Práticas complementares</Link>
      </>} />

    <div className="ac3-grid2">
      <div className="ac3-stack">
        <AcademyPanel title="Próximas missões">
          {items.map(({ release, formation, next: lesson, lessons }) => lesson && <div className="ac3-mission" key={release.id + ':' + formation.id}>
            <KitArt asset={formationArt(formation.kind, lessons.indexOf(lesson))} width={38} />
            <div className="ac3-text"><small>{formationLabels[formation.kind]} · {lesson.minutes} min</small><strong>{lesson.title}</strong></div>
            <Link className="ac3-button" href={academyLessonHref(release.id, lesson.id)} prefetch={false}>Abrir <ArrowRight size={13} aria-hidden="true" /></Link>
          </div>)}
          {!next && <p>Você concluiu as aulas disponíveis. Confira suas revisões.</p>}
        </AcademyPanel>
        <section>
          <header className="ac3-sectionhead"><h2>Suas formações</h2><small>{items.length} percursos · {total} aulas</small></header>
          <div className="ac3-formationgrid">{items.map((item) => {
            const { formation, release, lessons } = item
            return <Link className={'ac3-button ac3-formation' + (formation.kind === 'english' ? ' ac3-eng' : '')}
              key={release.id + ':' + formation.id} href={academyExploreHref(journeyPath, formationSelection(item))} prefetch={false}>
              <div><span className="ac3-eyebrow">{formation.kind === 'tech' ? 'Tecnologia' : 'Comunicação'}</span><br />
                <strong>{formationLabels[formation.kind]}</strong><p>{formation.kind === 'tech' ? 'Do zero ao código' : 'Inglês desde o zero'}</p></div>
              <KitArt asset={formationArt(formation.kind)} width={105} height={100} />
              <div><Meter value={item.count} total={lessons.length} label={formation.title} /><small>{item.count} de {lessons.length} aulas</small></div>
            </Link>
          })}</div>
        </section>
        <AcademyPanel title="Continue sua jornada">
          <div className="ac3-chapterrow">{items.map((item) => {
            const { release, formation } = item
            const current = formation.chapters.findIndex(({ lessons }) => lessons.some(({ id }) => id === item.next?.id))
            const index = Math.max(0, current)
            const chapter = formation.chapters[index]
            if (!chapter) return null
            return <Link className="ac3-button ac3-chaptercard" key={release.id + ':' + formation.id}
              href={academyExploreHref(journeyPath, formationSelection(item), { capitulo: chapter.id })} prefetch={false}>
              <KitArt asset={formationArt(formation.kind, index * 5)} width={64} height={58} />
              <span><small>{formationLabels[formation.kind]}</small><br /><strong>{chapter.title}</strong><br />
                <small>Capítulo {index + 1} <ArrowRight size={12} aria-hidden="true" /></small></span>
            </Link>
          })}</div>
        </AcademyPanel>
        {archivedHistory.length > 0 && <AcademyPanel title="Histórico das formações piloto">
          <details><summary>Ver aulas do piloto</summary>
            {archivedHistory.map(({ release, completedCount, totalCount, lessons }) => <div key={release.id}>
              <p>{completedCount} de {totalCount} aulas concluídas</p>
              <ul className="ac3-inline-links">{lessons.map((lesson) => <li key={lesson.id}>
                <Link href={academyLessonHref(release.id, lesson.id)} prefetch={false}>{lesson.title} · {lesson.completed ? 'Concluída' : 'Em estudo'}</Link>
              </li>)}</ul>
            </div>)}
          </details>
        </AcademyPanel>}
      </div>

      <aside className="ac3-stack" aria-label="Acompanhamento da Academy">
        <AcademyProgressPanel value={count} total={total} reviews={due.length} />
        <AcademyMentorPanel pose="encouraging">
          <p>{resumed ? 'Retome sua última missão. Use as etapas da aula para revisar e praticar antes de avançar.' :
            next ? 'Comece pela primeira missão. Leia, experimente e pratique antes de avançar.' : 'Volte às atividades de revisão para reforçar o que aprendeu.'}</p>
        </AcademyMentorPanel>
        {project && <AcademyPanel title="OmniStock · projeto guiado">
          <div className="ac3-mentor"><KitArt asset="activities/project" width={77} height={77} /><p>{project.formation.description}</p></div>
          <Link className="ac3-linkbtn" href={academyExploreHref(journeyPath, formationSelection(project))} prefetch={false}>Ver percurso Tech <ArrowRight size={13} aria-hidden="true" /></Link>
        </AcademyPanel>}
        <AcademyPanel title="Revisão e conquistas" id="revisoes">
          {due.length ? <ul className="ac3-inline-links">{due.map(({ lesson, releaseId }) =>
            <li key={releaseId + ':' + lesson.id}><Link href={academyLessonHref(releaseId, lesson.id, true)} prefetch={false}>{lesson.title}</Link></li>)}</ul> :
            <p>As revisões aparecem a partir do dia seguinte à conclusão.</p>}
          {items.filter(({ count }) => count > 0).map(({ release, formation }) => <div key={release.id + ':' + formation.id} className="ac3-mission">
            <KitArt asset={formation.kind === 'tech' ? 'achievements/first-code' : 'achievements/first-words'} width={38} /><small>Primeira aula concluída · {formationLabels[formation.kind]}</small>
          </div>)}
          <Link className="ac3-linkbtn" href="/dashboard/revisoes" prefetch={false}>Revisão de flashcards <ArrowRight size={13} aria-hidden="true" /></Link>
        </AcademyPanel>
        <section className="ac3-panel"><StudyGoal minutes={home.minutes} /></section>
        {market && <AcademyPanel title="Conexão com o mercado">
          <p>{market.description}</p>
          <details><summary>Fontes e limitações</summary>{market.sources.map((source) =>
            <p key={source.title}><strong>{source.title}</strong> · {source.date}. {source.caveat}</p>)}</details>
          {!!market.vacancies.length && <ul className="ac3-inline-links">{market.vacancies.map((vacancy) =>
            <li key={vacancy.id}><a href={vacancy.sourceUrl} rel="noreferrer">{vacancy.title} · {vacancy.region}</a></li>)}</ul>}
        </AcademyPanel>}
      </aside>
    </div>
  </>
}
