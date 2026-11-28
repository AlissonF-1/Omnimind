import Link from 'next/link'
import { ArrowLeft } from '@/components/icons'
import { notFound } from 'next/navigation'
import { AcademyPanel, Meter } from '@/components/academy/AcademyVisual'
import { PracticeFeedback, PracticeQuestion } from '@/components/academy/PracticeControls'
import { InlineCode } from '@/components/academy/InlineCode'
import { getPracticeSession, PracticeSchemaMissing } from '@/lib/academy/practice-server'
import { outcomeLabel, practiceDifficulties, practiceHref, practiceKinds, practicePath, practiceReasons, practiceUuid } from '@/lib/academy/practice'
import '../practice.css'

export const metadata = { title: 'Sessão de prática · OmniMind Academy' }

export default async function PracticeSessionPage({ params,searchParams }: {
  params: Promise<{ sessao:string }>; searchParams: Promise<{ etapa?:string }>
}) {
  const [{ sessao },{ etapa }] = await Promise.all([params,searchParams])
  if (!practiceUuid.test(sessao)) notFound()
  const state = await getPracticeSession(sessao,etapa).catch((error: unknown) => {
    if (error instanceof PracticeSchemaMissing) return null
    throw error
  })
  if (!state) notFound()
  const { slots,selected,item } = state
  const sessionUrl = practicePath+'/'+sessao
  const answered = slots.filter(({ answered_at }) => answered_at !== null)
  const next = selected?.answered_at
    ? (state.next ? sessionUrl+'?etapa='+state.next.position : sessionUrl+'?resultado=1')
    : (selected && selected.position < slots.length ? sessionUrl+'?etapa='+(selected.position+1) : sessionUrl+'?resultado=1')
  return <div className="ac-practice ac-practice-session">
    <header className="ac3-panel">
      <Link className="ac3-linkbtn" href={practicePath} prefetch={false}><ArrowLeft size={16} aria-hidden="true" /> Práticas complementares</Link>
      <h1>{item?.title ?? 'Resultado da sessão'}</h1>
      <p>{item && selected ? `${item.topic} · ${practiceKinds[item.activity.kind]} · ${practiceDifficulties[item.difficulty]}` : 'Confira suas respostas e escolha o que reforçar.'}</p>
      <Meter value={answered.length} total={slots.length} label="Atividades registradas" />
      <small>{answered.length} de {slots.length} registradas{selected ? ` · Questão ${selected.position}` : ''}</small>
    </header>
    {item && selected ? <section className="ac3-panel">
      <p><small>{practiceReasons[selected.reason]}</small></p>
      {item.prerequisites.length > 0 && <details className="ac-practice-prerequisites"><summary>Conhecimentos prévios</summary>
        <ul>{item.prerequisites.map((value,index) => <li key={index}>{value}</li>)}</ul>
      </details>}
      {selected.outcome ? <><p className="ac-practice-prompt"><InlineCode text={item.activity.prompt} /></p>
        <PracticeFeedback result={{outcome:selected.outcome,credit:selected.credit,feedback:state.feedback ?? ''}} next={next} />
        <Link className="ac3-linkbtn" href={sessionUrl} prefetch={false}>Voltar ao resumo da sessão</Link></> :
        <PracticeQuestion key={`${sessao}:${selected.position}:${state.account}`} activity={item.activity} draft={state.draft} account={state.account}
          session={sessao} position={selected.position} next={next} />}
    </section> : <AcademyPanel title="Sessão concluída">
      <dl className="ac-practice-metrics">
        <div className="ac3-metric"><dt>Acertos</dt><dd>{answered.filter(({outcome}) => outcome==='correct').length}</dd></div>
        <div className="ac3-metric"><dt>Para revisar</dt><dd>{answered.filter(({outcome}) => outcome==='incorrect').length}</dd></div>
        <div className="ac3-metric"><dt>Práticas Python</dt><dd>{answered.filter(({outcome}) => outcome==='practiced').length}</dd></div>
      </dl>
      <div className="ac3-actions"><Link className="ac3-button ac3-primary" href={practiceHref({mode:'mistakes'})} prefetch={false}>Revisar erros</Link>
        <Link className="ac3-button" href={practicePath} prefetch={false}>Nova sessão</Link></div>
    </AcademyPanel>}
    {answered.length > 0 && <AcademyPanel title="Respostas da sessão">
      <ol className="ac-practice-list">{answered.map((slot) => <li key={slot.position}>
        <div><strong>Questão {slot.position}</strong><small>{slot.outcome ? outcomeLabel[slot.outcome] : ''} · {slot.item_id}</small></div>
        <Link className="ac3-button" href={sessionUrl+'?etapa='+slot.position} prefetch={false}>Ver feedback</Link>
      </li>)}</ol>
    </AcademyPanel>}
  </div>
}
