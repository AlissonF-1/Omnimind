import Link from 'next/link'
import { AcademyEmpty, AcademyHero, AcademyPanel, AcademyStatus, FormationSwitch, KitArt, Meter } from '@/components/academy/AcademyVisual'
import { academyLessonHref, buildAcademyDashboardState } from '@/lib/academy/contracts'
import { academyExploreHref, academyLessonStatus, formationArt, formationSelection, journeyPath, selectAcademyFormation, skillsPath } from '@/lib/academy/presentation'
import { AcademySchemaMissing, getAcademyHome } from '@/lib/academy/server'

type Query = Record<string, string | string[] | undefined>
const pageSize = 12

export default async function AcademySkills({ searchParams }: { searchParams: Promise<Query> }) {
  const [home, query] = await Promise.all([getAcademyHome().catch((error: unknown) => {
    if (error instanceof AcademySchemaMissing) return null
    throw error
  }), searchParams])
  if (!home) return <AcademyEmpty unavailable />
  const { items } = buildAcademyDashboardState(home.releases, home.rows, home.now)
  const item = selectAcademyFormation(items, query.release, query.form, query.track)
  if (!item) return <AcademyEmpty />
  const { formation, release, progress, completed, lessons } = item
  const catalog = new Map(release.catalog.competencies.map((skill) => [skill.id, skill]))
  const visit = new Set(lessons.flatMap(({ competencies }) => competencies))
  for (const id of visit) for (const dependency of catalog.get(id)?.prerequisites ?? []) visit.add(dependency)
  const candidates = release.catalog.competencies.filter(({ id }) => visit.has(id))
  const selectedIndex = candidates.findIndex(({ id }) => id === query.competencia)
  const pageCount = Math.max(1, Math.ceil(candidates.length / pageSize))
  const pageNumber = typeof query.pagina === 'string' ? Number(query.pagina) : Math.floor(Math.max(0, selectedIndex) / pageSize) + 1
  const page = Number.isSafeInteger(pageNumber) ? Math.min(pageCount, Math.max(1, pageNumber)) : 1
  const offset = (page - 1) * pageSize
  const visible = candidates.slice(offset, offset + pageSize)
  const chosen = visible.find(({ id }) => id === query.competencia) ?? visible[0]
  const selection = formationSelection(item)
  const href = (skill: string, toPage?: number) => academyExploreHref(skillsPath, selection, {
    ...(skill ? { competencia: skill } : {}), ...(toPage ? { pagina: String(toPage) } : {}),
  })
  const relatedBySkill = new Map(candidates.map((skill) => [skill.id, lessons.filter(({ competencies }) => competencies.includes(skill.id))]))
  const linked = chosen ? relatedBySkill.get(chosen.id) ?? [] : []
  const done = linked.filter(({ id }) => completed.has(id))
  const reviewed = done.filter(({ id }) => (progress.get(id)?.review_count ?? 0) > 0)
  const english = formation.kind === 'english'

  return <div className={english ? 'ac3-english' : undefined}>
    <AcademyHero eyebrow="Mapa de competências" title="Construa sua base"
      description="Entenda como cada habilidade se conecta às próximas." scene={english ? 'english' : 'programming'} pose="thinking"
      actions={<Link className="ac3-button" href={academyExploreHref(journeyPath, selection)} prefetch={false}>Voltar à jornada</Link>} />
    <FormationSwitch items={items} active={item} path={skillsPath} />
    {chosen ? <div className="ac3-grid2">
      <AcademyPanel title="Relações de aprendizagem" action={<small>Pré-requisitos</small>}>
        <nav className="ac3-skillgrid" aria-label="Competências da formação">{visible.map((skill, index) => {
          const count = relatedBySkill.get(skill.id)?.filter(({ id }) => completed.has(id)).length ?? 0
          const prerequisite = skill.prerequisites.map((id) => catalog.get(id)?.title ?? id)
          return <Link className={'ac3-button ac3-skill' + (skill === chosen ? ' ac3-selected' : '')} key={skill.id}
            aria-current={skill === chosen ? 'step' : undefined} href={href(skill.id, page)} scroll={false} prefetch={false}>
            <KitArt asset={formationArt(formation.kind, offset + index)} width={68} height={64} />
            <small>{String(offset + index + 1).padStart(2, '0')}{prerequisite.length ? ' · ' + prerequisite.length + ' pré-requisitos' : ' · Início'}</small>
            <strong>{skill.title}</strong><small>{count ? 'Prática registrada' : 'Sem evidência'}</small>
          </Link>
        })}</nav>
        {pageCount > 1 && <nav className="ac3-splitbar" aria-label="Páginas de competências">
          {page > 1 && <Link className="ac3-button" href={href('', page - 1)} prefetch={false}>Anterior</Link>}
          <small>Página {page} de {pageCount}</small>
          {page < pageCount && <Link className="ac3-button" href={href('', page + 1)} prefetch={false}>Próxima</Link>}
        </nav>}
      </AcademyPanel>
      <aside className="ac3-stack" aria-label="Detalhes da competência">
        <AcademyPanel title="Competência selecionada">
          <div className="ac3-detail">
            <KitArt asset={formationArt(formation.kind, candidates.indexOf(chosen))} className="ac3-detailart" width={160} height={125} />
            <h3 className="ac3-detailtitle">{chosen.title}</h3><p>{chosen.description}</p>
            <h3>Pré-requisitos</h3>
            {chosen.prerequisites.length ? <ul className="ac3-inline-links">{chosen.prerequisites.map((id) =>
              <li key={id}><Link href={href(id)} prefetch={false}>{catalog.get(id)?.title ?? id}</Link></li>)}</ul> : <small>Nenhum</small>}
            {!!linked.length && <ul className="ac3-inline-links">{linked.map((lesson) => {
              const status = academyLessonStatus(lesson, progress.get(lesson.id), completed, home.now)
              return <li className="ac3-related-lesson" key={lesson.id}><Link href={academyLessonHref(release.id, lesson.id, status.key === 'review')}
                prefetch={false}>{lesson.title}</Link> <AcademyStatus label={status.label} tone={status.key} /></li>
            })}</ul>}
          </div>
        </AcademyPanel>
        <AcademyPanel title="Evidências">
          <p>{chosen.mastery.description}</p>
          <Meter value={done.length} total={linked.length} label="Aulas vinculadas concluídas" />
          <small>{done.length} aulas concluídas · {reviewed.length} com revisão registrada</small>
        </AcademyPanel>
      </aside>
    </div> : <AcademyPanel title="Competências da formação"><p>As competências aparecem quando são vinculadas às aulas.</p></AcademyPanel>}
  </div>
}
