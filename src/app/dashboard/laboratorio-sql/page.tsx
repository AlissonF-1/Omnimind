import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowUpRight, Database, Braces } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { sqlLabChallenges, sqlLabHref } from '@/lib/sql-lab/catalog'
import { learningHref } from '@/lib/learning/progress'

export const metadata = { title: 'Laboratório SQL · OmniMind' }

export default async function SqlLabPage() {
  const db = await createClient()
  const { data: { user }, error } = await db.auth.getUser()
  if (error || !user) redirect('/login')
  const progress = await Promise.all(sqlLabChallenges.map(({ slug }) => db.from('sql_lab_attempts')
    .select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('challenge_slug', slug)))
  const available = progress.every((item) => !item.error)
  const submitted = progress.filter((item) => (item.count ?? 0) > 0).length

  return <>
    <Link className="sl-back" href={learningHref('sql-concursos-e-mercado')}>← Trilha SQL</Link>
    <header className="sl-hero">
      <div><h1>Laboratório SQL</h1><p>Escreva consultas para cenários fictícios, revise pela rubrica e acompanhe seus envios.</p>
        {available && <div className="sl-progress"><label htmlFor="sl-progress">{submitted} de {sqlLabChallenges.length} desafios com envio</label>
          <progress id="sl-progress" value={submitted} max={sqlLabChallenges.length} /></div>}</div>
      <Database className="sl-hero-icon" aria-hidden="true" />
    </header>
    {!available && <p className="sl-panel" role="status">Histórico indisponível neste ambiente. Você pode ler os desafios e consultar as pistas do material.</p>}
    <div className="sl-grid">{sqlLabChallenges.map((challenge, index) =>
      <article key={challenge.slug} className="sl-panel sl-card">
        <p className="sl-topic"><Braces size={16} aria-hidden="true" />{challenge.topic}</p>
        <h2>{challenge.title}</h2>
        <p>{available ? (progress[index].count ? 'Envio registrado' : 'Aguardando primeiro envio') : 'Consultar desafio'}</p>
        <Link className="sl-button" href={sqlLabHref(challenge.slug)}>Abrir desafio <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </article>)}</div>
  </>
}
