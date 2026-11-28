import Link from 'next/link'
import { ArrowLeft, ArrowRight, History, Target } from '@/components/icons'
import { AcademyHero, AcademyPanel } from '@/components/academy/AcademyVisual'
import { StartPractice } from '@/components/academy/PracticeControls'
import { academyPath } from '@/lib/academy/contracts'
import { getPracticeHome, PracticeSchemaMissing } from '@/lib/academy/practice-server'
import { getPracticeFilters, practiceDifficulties, practiceHref, practiceId, practiceKinds, practiceModes, practicePath, practiceReasons } from '@/lib/academy/practice'
import './practice.css'

export const metadata = { title: 'Práticas · OmniMind Academy' }
const date = new Intl.DateTimeFormat('pt-BR',{ dateStyle:'short',timeZone:'America/Sao_Paulo' })

export default async function PracticePage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const params = await searchParams
  const filters = getPracticeFilters(params)
  const after = typeof params.after === 'string' && practiceId.test(params.after) ? params.after : null
  const historyPage = typeof params.h === 'string' && /^\d{1,4}$/.test(params.h) ? Number(params.h) : 0
  const home = await getPracticeHome(filters,after,historyPage).catch((error: unknown) => {
    if (error instanceof PracticeSchemaMissing) return null
    throw error
  })
  if (!home) return <AcademyPanel title="Práticas indisponíveis neste ambiente">
    <p>O banco complementar ainda precisa ser configurado neste Supabase.</p>
    <Link className="ac3-button" href={academyPath}>Voltar à Academy</Link>
  </AcademyPanel>
  const { overview,catalog,account } = home
  const accuracy = overview.answered > 0 ? `${Math.round(overview.correct*100/overview.answered)}%` : '—'
  const metrics = [[overview.available,'Disponíveis'],[overview.answered,'Respondidas'],[overview.correct,'Acertos'],[overview.incorrect,'Erros'],[accuracy,'Taxa de acertos']]
  return <div className="ac-practice">
    <AcademyHero title="Práticas complementares" description="Escolha o que reforçar e continue de onde parou. As atividades são opcionais."
      scene="academy" pose="teaching" actions={<>
        {home.resume && <Link className="ac3-button ac3-primary" href={practicePath+'/'+home.resume} prefetch={false}>Retomar sessão <ArrowRight size={16} aria-hidden="true" /></Link>}
        <Link className="ac3-button" href="#historico"><History size={16} aria-hidden="true" /> Histórico</Link>
      </>} />
    <AcademyPanel title="Seu desempenho nas edições vigentes">
      <dl className="ac-practice-metrics">{metrics.map(([value,label]) => <div className="ac3-metric" key={label}>
        <dt>{label}</dt><dd>{value}</dd>
      </div>)}</dl>
      <p><small>Acertos e erros contam a última tentativa por questão. Laboratório Python registrado à parte{overview.practiced ? ` · ${overview.practiced} práticas` : ''}.</small></p>
    </AcademyPanel>

    <section className="ac-practice-columns">
      <div className="ac3-stack">
        <AcademyPanel title="Monte sua sessão">
          <form method="get" action={practicePath} className="ac-practice-filters">
            {filters.lesson && <input type="hidden" name="lesson" value={filters.lesson} />}
            <label>Assunto<select name="topic" defaultValue={filters.topic ?? ''}>
              <option value="">Todos</option>{overview.topics.map((topic) => <option key={topic}>{topic}</option>)}
            </select></label>
            <label>Competência<select name="skill" defaultValue={filters.skill ?? ''}>
              <option value="">Todas</option>{overview.skills.map(({id,label}) => <option key={id} value={id}>{id} · {label}</option>)}
            </select></label>
            <label>Dificuldade<select name="difficulty" defaultValue={filters.difficulty ?? ''}>
              <option value="">Todas</option>{Object.entries(practiceDifficulties).map(([id,label]) => <option key={id} value={id}>{label}</option>)}
            </select></label>
            <label>Formato<select name="kind" defaultValue={filters.kind ?? ''}>
              <option value="">Todos</option>{overview.kinds.map((id) => <option key={id} value={id}>{practiceKinds[id]}</option>)}
            </select></label>
            <label>Tipo de prática<select name="mode" defaultValue={filters.mode ?? 'all'}>
              {Object.entries(practiceModes).map(([id,label]) => <option key={id} value={id}>{label}</option>)}
            </select></label>
            <label>Módulo<select name="module" defaultValue={filters.module ?? ''}>
              <option value="">Todos</option>{overview.modules.map((id) => <option key={id}>{id}</option>)}
            </select></label>
            <div className="ac3-actions"><button className="ac3-button" type="submit">Aplicar filtros</button>
              <Link className="ac3-button" href={practicePath} prefetch={false}>Limpar filtros</Link></div>
          </form>
          {filters.lesson && <p><small>Exibindo as práticas associadas à aula de origem.</small></p>}
          <StartPractice account={account} filters={filters} total={overview.filtered} />
        </AcademyPanel>

        <AcademyPanel title="Atividades" action={<small>{overview.filtered} com estes filtros</small>}>
          {catalog.items.length ? <ul className="ac-practice-list">{catalog.items.map((item) => <li key={item.item_id}>
            <div><strong>{item.title}</strong><small>{item.topic} · {practiceKinds[item.kind]} · {practiceDifficulties[item.difficulty]}</small></div>
            <StartPractice account={account} filters={filters} item={item.item_id} label={item.kind === 'python' ? 'Abrir desafio' : 'Praticar'} />
          </li>)}</ul> : <p>{overview.available ? 'Nenhuma questão com estes filtros.' : 'Ainda não há atividades publicadas.'}</p>}
          <nav className="ac3-actions" aria-label="Páginas de atividades">
            {after && <Link className="ac3-button" href={practiceHref(filters)} prefetch={false}><ArrowLeft size={14} aria-hidden="true" /> Primeira página</Link>}
            {catalog.next && <Link className="ac3-button" href={practiceHref(filters,{after:catalog.next})} prefetch={false}>Próxima página <ArrowRight size={14} aria-hidden="true" /></Link>}
          </nav>
        </AcademyPanel>
      </div>
      <aside className="ac3-stack">
        <AcademyPanel title="Pratique a seguir" action={<Target size={18} aria-hidden="true" />}>
          {overview.recommended.length ? <ul className="ac-practice-list">{overview.recommended.map((entry) => <li key={entry.item_id}>
            <div><strong>{entry.title}</strong><small>{practiceReasons[entry.reason]}</small></div>
            <StartPractice account={account} filters={{mode:'recommended'}} item={entry.item_id} label="Praticar" />
          </li>)}</ul> : <p>As sugestões aparecem à medida que houver atividades disponíveis.</p>}
          {overview.available > 0 && <Link className="ac3-button" href={practiceHref({mode:'recommended'})} prefetch={false}>Montar sessão recomendada</Link>}
        </AcademyPanel>
        <AcademyPanel title="Competências para reforçar">
          {overview.weak.length ? <ul className="ac-practice-list">{overview.weak.map(({id,label,errors}) => <li key={id}>
            <div><strong>{label}</strong><small>{errors} {errors === 1 ? 'questão errada' : 'questões erradas'} nos últimos 14 dias</small></div>
            <Link className="ac3-button" href={practiceHref({skill:id,mode:'mistakes'})} prefetch={false}>Revisar</Link>
          </li>)}</ul> : <p>Os pontos de revisão aparecem após suas tentativas.</p>}
          <Link className="ac3-button" href={practiceHref({mode:'mistakes'})} prefetch={false}>Revisar erros</Link>
        </AcademyPanel>
        <AcademyPanel title="Histórico de sessões" id="historico">
          {home.history.length ? <ul className="ac-practice-list">{home.history.map((session) => <li key={session.id}>
            <div><strong>{session.filters.topic ?? (session.filters.kind ? practiceKinds[session.filters.kind] : 'Sessão de prática')}</strong>
              <small>{date.format(new Date(session.created_at))} · {session.finished_at ? 'Concluída' : 'Em andamento'}</small></div>
            <Link className="ac3-button" href={practicePath+'/'+session.id} prefetch={false}>{session.finished_at ? 'Ver resultados' : 'Continuar'}</Link>
          </li>)}</ul> : <p>Você ainda não iniciou uma sessão.</p>}
          <nav className="ac3-actions" aria-label="Páginas do histórico">
            {historyPage > 0 && <Link className="ac3-button" href={practiceHref(filters,{h:String(historyPage-1)})+'#historico'} prefetch={false}>Anterior</Link>}
            {home.hasHistoryNext && <Link className="ac3-button" href={practiceHref(filters,{h:String(historyPage+1)})+'#historico'} prefetch={false}>Próxima</Link>}
          </nav>
        </AcademyPanel>
      </aside>
    </section>
  </div>
}
