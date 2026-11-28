import Link from 'next/link'
import { ArrowLeft, ArrowRight } from '@/components/icons'
import { AcademyEmpty, AcademyHero, AcademyMentorPanel, AcademyPanel, AcademyProgressPanel, AcademyStatus, FormationSwitch, KitArt } from '@/components/academy/AcademyVisual'
import { academyLessonHref, buildAcademyDashboardState } from '@/lib/academy/contracts'
import { academyExploreHref, academyLessonStatus, chapterWindow, formationArt, formationLabels, formationSelection,
  journeyConnection, journeyPath, journeyPoints, selectAcademyFormation, skillsPath } from '@/lib/academy/presentation'
import { AcademySchemaMissing, getAcademyHome, getAcademyLessonObjectives } from '@/lib/academy/server'

type Query = Record<string, string | string[] | undefined>
const pageSize = 6

export default async function AcademyJourney({ searchParams }: { searchParams: Promise<Query> }) {
  const [home, query] = await Promise.all([getAcademyHome().catch((error: unknown) => {
    if (error instanceof AcademySchemaMissing) return null
    throw error
  }), searchParams])
  if (!home) return <AcademyEmpty unavailable />
  const { items } = buildAcademyDashboardState(home.releases, home.rows, home.now)
  const item = selectAcademyFormation(items, query.release, query.form, query.track)
  if (!item) return <AcademyEmpty />
  const { formation, release, completed, progress, next, count, lessons } = item
  const selection = formationSelection(item)
  const chapters = formation.chapters
  const selectedIndex = chapters.findIndex(({ id }) => id === query.capitulo)
  const currentIndex = chapters.findIndex((chapter) => chapter.lessons.some(({ id }) => id === next?.id))
  const chapterIndex = selectedIndex >= 0 ? selectedIndex : Math.max(0, currentIndex)
  const chapter = chapters[chapterIndex]
  if (!chapter?.lessons.length) return <AcademyEmpty />
  const map = query.vista !== 'lista'
  const pageCount = Math.ceil(chapter.lessons.length / pageSize)
  const requestedMission = chapter.lessons.findIndex(({ id }) => id === query.missao)
  const currentMission = chapter.lessons.findIndex(({ id }) => id === next?.id)
  const defaultPage = Math.floor(Math.max(0, requestedMission >= 0 ? requestedMission : currentMission) / pageSize) + 1
  const requestedPage = typeof query.pagina === 'string' ? Number(query.pagina) : defaultPage
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 1 ? Math.min(requestedPage, pageCount) : defaultPage
  const visible = chapter.lessons.slice((page - 1) * pageSize, page * pageSize)
  const selected = visible.find(({ id }) => id === query.missao) ?? visible.find(({ id }) => id === next?.id) ?? visible[0]
  const status = (lesson: typeof selected) => academyLessonStatus(lesson, progress.get(lesson.id), completed, home.now)
  const selectedStatus = status(selected)
  const objectives = await getAcademyLessonObjectives(release.id, release.version, selected.id)
  const points = journeyPoints(visible.length)
  const edges = visible.flatMap((lesson, index) => lesson.prerequisites.flatMap((id) => {
    const origin = visible.findIndex((entry) => entry.id === id)
    return origin < 0 ? [] : [{ id: id + ':' + lesson.id, path: journeyConnection(points[origin], points[index]) }]
  }))
  const allLessons = new Map(release.catalog.formations.flatMap(({ chapters }) => chapters.flatMap(({ lessons }) => lessons))
    .map((lesson) => [lesson.id, lesson] as const))
  const nearby = chapterWindow(chapters, chapterIndex, 5)
  const href = (id: string, newPage: number, mode = map ? 'mapa' : 'lista', mission?: string) =>
    academyExploreHref(journeyPath, selection, { capitulo: id, pagina: String(newPage), vista: mode, ...(mission ? { missao: mission } : {}) })
  const english = formation.kind === 'english'
  const selectedArt = formationArt(formation.kind, lessons.indexOf(selected))

  return <div className={english ? 'ac3-english' : undefined}>
    <AcademyHero eyebrow="Mapa de formação" title={formationLabels[formation.kind]} description={formation.description}
      scene={english ? 'english' : 'academy'} pose="teaching" actions={<>
        <Link className="ac3-button" href={academyExploreHref(skillsPath, selection)} prefetch={false}>Competências</Link>
        {next && <Link className="ac3-button ac3-primary" href={academyLessonHref(release.id, next.id)} prefetch={false}>Retomar missão</Link>}
      </>} />
    <FormationSwitch items={items} active={item} path={journeyPath} extra={map ? {} : { vista: 'lista' }} />
    <div className="ac3-grid2">
      <div className="ac3-stack">
        <section className="ac3-panel" aria-labelledby="ac3-chapter-title">
          <header className="ac3-sectionhead">
            <div><span className="ac3-eyebrow">Capítulo {chapterIndex + 1}</span><h2 id="ac3-chapter-title">{chapter.title}</h2></div>
            <Link className="ac3-button" href={href(chapter.id, page, map ? 'lista' : 'mapa', selected.id)}
              prefetch={false} scroll={false}>{map ? 'Ver lista' : 'Ver mapa'}</Link>
          </header>
          <nav className="ac3-splitbar" aria-label="Capítulos da formação">
            {nearby.start > 0 && <Link className="ac3-button" href={href(chapters[nearby.start - 1].id, 1)} prefetch={false} aria-label="Capítulos anteriores"><ArrowLeft size={15} /></Link>}
            {nearby.list.map((entry, index) => <Link className={'ac3-button' + (chapter.id === entry.id ? ' ac3-selected' : '')}
              key={entry.id} href={href(entry.id, 1)} prefetch={false} scroll={false} aria-current={chapter.id === entry.id ? 'step' : undefined}
              title={entry.title}>Capítulo {nearby.start + index + 1}</Link>)}
            {nearby.start + nearby.list.length < chapters.length && <Link className="ac3-button" href={href(chapters[nearby.start + nearby.list.length].id, 1)}
              prefetch={false} aria-label="Próximos capítulos"><ArrowRight size={15} /></Link>}
          </nav>
          <nav className={map ? 'ac3-map' : 'ac3-stack ac3-list'} aria-label="Missões do capítulo">
            {map && !!edges.length && <svg className="ac3-maplines" viewBox="0 0 600 350" preserveAspectRatio="none" aria-hidden="true">
              {edges.map((edge) => <path key={edge.id} d={edge.path} />)}
            </svg>}
            {visible.map((lesson) => {
              const index = lessons.indexOf(lesson)
              const state = status(lesson)
              const current = selected.id === lesson.id
              const className = map ? 'ac3-node' : 'ac3-button ac3-chaptercard'
              return <Link key={lesson.id} href={href(chapter.id, page, map ? 'mapa' : 'lista', lesson.id)}
                className={className + (current ? ' ac3-selected' : '') + (state.key === 'locked' ? ' ac3-locked' : '')}
                aria-current={current ? 'step' : undefined} scroll={false} prefetch={false}>
                <KitArt asset={formationArt(formation.kind, index)} width={map ? 130 : 64} height={map ? 112 : 58} />
                {map && <small>Missão {String(index + 1).padStart(2, '0')}</small>}
                <strong className="ac3-nodetitle">{lesson.title}</strong><AcademyStatus label={state.label} tone={state.key} />
              </Link>
            })}
          </nav>
          <p className="ac3-map-note">Selecione uma missão para ver seus detalhes. As linhas seguem os pré-requisitos do currículo.</p>
          <a className="ac3-linkbtn ac3-mobile-detail" href="#missao-selecionada">Ver missão selecionada <ArrowRight size={14} aria-hidden="true" /></a>
          {pageCount > 1 && <nav className="ac3-splitbar" aria-label="Páginas do capítulo">
            {page > 1 && <Link className="ac3-button" href={href(chapter.id, page - 1)} prefetch={false}>Anterior</Link>}
            <small>Página {page} de {pageCount}</small>
            {page < pageCount && <Link className="ac3-button" href={href(chapter.id, page + 1)} prefetch={false}>Próxima</Link>}
          </nav>}
        </section>
      </div>
      <aside className="ac3-stack" aria-label="Detalhes da jornada">
        <AcademyProgressPanel title={formationLabels[formation.kind]} value={count} total={lessons.length}
          reviews={lessons.filter((lesson) => status(lesson).key === 'review').length} />
        <AcademyPanel title="Missão selecionada" id="missao-selecionada">
          <div className="ac3-detail">
            <KitArt asset={selectedArt} className="ac3-detailart" width={160} height={125} />
            <AcademyStatus label={selectedStatus.label} tone={selectedStatus.key} /><h3 className="ac3-detailtitle">{selected.title}</h3>
            <p>{selected.summary}</p><small>{selected.minutes} minutos estimados</small>
            {!!objectives.length && <ul>{objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul>}
            {selectedStatus.key === 'locked' ? <div className="ac3-feedback ac3-bad"><strong>Pré-requisitos pendentes</strong><ul>
              {selected.prerequisites.filter((id) => !completed.has(id)).map((id) => <li key={id}><Link
                href={academyLessonHref(release.id, id)} prefetch={false}>{allLessons.get(id)?.title ?? id}</Link></li>)}
            </ul></div> : <Link className="ac3-button ac3-primary" href={academyLessonHref(release.id, selected.id, selectedStatus.key === 'review')}
              prefetch={false}>{selectedStatus.key === 'review' ? 'Revisar missão' : 'Abrir missão'} <ArrowRight size={14} /></Link>}
            {selectedStatus.key === 'review' && <Link className="ac3-linkbtn" href={academyLessonHref(release.id, selected.id)} prefetch={false}>Revisitar aula</Link>}
          </div>
        </AcademyPanel>
        <AcademyMentorPanel pose="thinking"><p>Explore o mapa e escolha sua próxima missão. As aulas bloqueadas mostram o requisito pendente.</p></AcademyMentorPanel>
      </aside>
    </div>
  </div>
}
