import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import SqlLabEditor from '@/components/sql-lab/SqlLabEditor'
import { isAssistantId } from '@/lib/assistant/contracts'
import { findSqlLabChallenge, sqlLabChallenges, sqlLabHref, sqlLabPath } from '@/lib/sql-lab/catalog'
import { listSqlLabAttempts } from '@/lib/sql-lab/server'
import { learningHref } from '@/lib/learning/progress'
import { createClient } from '@/utils/supabase/server'

export const metadata = { title: 'Desafio SQL · OmniMind' }

export default async function SqlLabChallengePage({ params, searchParams }: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ etapa?: string }>
}) {
  const [{ slug }, { etapa }] = await Promise.all([params, searchParams])
  const challenge = findSqlLabChallenge(slug)
  if (!challenge) notFound()
  const db = await createClient()
  const { data: { user }, error } = await db.auth.getUser()
  if (error || !user) redirect('/login')
  const attempts = await listSqlLabAttempts(db, user.id, slug).catch(() => null)
  const next = sqlLabChallenges[sqlLabChallenges.indexOf(challenge) + 1]
  const returnHref = learningHref('sql-concursos-e-mercado', isAssistantId(etapa) ? etapa : undefined)
  return <>
    <nav className="sl-actions" aria-label="Navegação do desafio">
      <Link className="sl-back" href={sqlLabPath}>← Laboratório SQL</Link>
      <Link className="sl-back" href={returnHref}>Voltar à trilha</Link>
    </nav>
    <header className="sl-hero"><div><p className="sl-topic">{challenge.topic}</p><h1>{challenge.title}</h1><p>{challenge.task}</p></div></header>
    {attempts === null && <p className="sl-panel" role="status">Histórico e envio indisponíveis. Confira se o Supabase de teste tem a migration de SQL Lab.</p>}
    <div className="sl-detail">
      <aside className="sl-guide" aria-label="Orientações do desafio">
        <section className="sl-panel"><h2>Esquema fictício</h2>
          {challenge.schema.map((table) => <pre key={table}><code>{table}</code></pre>)}
        </section>
        <section className="sl-panel"><h2>Rubrica</h2><ul>{challenge.rubric.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
          <p>O feedback interpreta a consulta como texto. A execução e a aprovação ficam fora deste exercício.</p>
        </section>
        {next && <Link className="sl-button" href={sqlLabHref(next.slug)}>Próximo desafio →</Link>}
        {isAssistantId(etapa) && <Link className="sl-button" href={returnHref}>Revisar a etapa de origem</Link>}
      </aside>
      <div className="sl-workbench"><SqlLabEditor key={user.id + ':' + slug} accountId={user.id} challenge={challenge}
        initialAttempts={attempts ?? []} savingAvailable={attempts !== null} /></div>
    </div>
  </>
}
