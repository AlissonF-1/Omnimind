import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight, Check, FolderOpen, Layers3, Timer } from '@/components/icons'
import { createClient } from '@/utils/supabase/server'

type WorkspaceJoin = { workspace_id: string | null }

export default async function WorkspaceSelector() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const now = new Date()
  const [workspacesResult, cardsResult, sprintResult] = await Promise.all([
    supabase.from('workspaces').select('id, name, description, is_archived'),
    supabase.from('flashcards').select('id, due, state, notes!inner(workspace_id)').eq('notes.user_id', user.id),
    supabase.from('workspaces').select('id').eq('is_sprint_mode', true).gte('sprint_date', now.toISOString()).eq('user_id', user.id),
  ])

  const activeWorkspaces = (workspacesResult.data ?? []).filter((workspace) => !workspace.is_archived)
  const sprintIds = new Set(sprintResult.data?.map((workspace) => workspace.id))
  const dueCounts = new Map<string, number>()

  for (const card of cardsResult.data ?? []) {
    const note = card.notes as WorkspaceJoin | WorkspaceJoin[] | null
    const id = Array.isArray(note) ? note[0]?.workspace_id : note?.workspace_id
    if (!id) continue

    const needsReview = !card.due || card.state === 0 || card.state === null || Date.parse(card.due) <= now.getTime() || sprintIds.has(id)
    if (needsReview) dueCounts.set(id, (dueCounts.get(id) ?? 0) + 1)
  }

  const pendingCount = activeWorkspaces.reduce((sum, workspace) => sum + (dueCounts.get(workspace.id) ?? 0), 0)
  const countsAvailable = !cardsResult.error && !sprintResult.error

  return (
    <section className="rv-queue" aria-labelledby="fila-titulo">
      <div className="rv-between">
        <div>
          <h2 id="fila-titulo">Fila de revisão</h2>
          {!workspacesResult.error && <p>{activeWorkspaces.length === 1 ? '1 workspace ativo' : activeWorkspaces.length + ' workspaces ativos'}</p>}
        </div>
        {activeWorkspaces.length > 0 && countsAvailable && (
          <span className={'rv-pill ' + (pendingCount > 0 ? 'rv-orange' : 'rv-green')}>
            <Layers3 size={15} aria-hidden="true" /> {pendingCount} {pendingCount === 1 ? 'card na fila' : 'cards na fila'}
          </span>
        )}
      </div>

      {workspacesResult.error ? (
        <div className="rv-panel rv-loading" role="alert">
          <span>Não foi possível carregar os workspaces.</span>
          <form method="get" action="/dashboard/revisoes">
            <button className="rv-button" type="submit">Tentar novamente</button>
          </form>
        </div>
      ) : activeWorkspaces.length === 0 ? (
        <div className="rv-panel rv-empty-queue">
          <span className="rv-icon"><FolderOpen size={23} aria-hidden="true" /></span>
          <div>
            <h3>Crie seu primeiro workspace</h3>
            <p>Use o menu lateral para criar uma matéria. Depois, gere flashcards a partir de uma nota para começar a revisar.</p>
          </div>
        </div>
      ) : (
        <ul className="rv-grid">
          {activeWorkspaces.map((workspace) => {
            const count = dueCounts.get(workspace.id) ?? 0
            const Status = count > 0 ? Timer : Check
            return (
              <li key={workspace.id}>
                <Link href={'/dashboard/revisoes?workspaceId=' + encodeURIComponent(workspace.id)}
                  className="rv-panel rv-workspace" data-pending={countsAvailable && count > 0}
                >
                  <div className="rv-between" aria-hidden="true">
                    <Image className="rv-workspace-art" src="/images/brain_workspace_3d.jpg" alt="" width={52} height={52} />
                    <span className="rv-workspace-arrow"><ArrowUpRight size={20} /></span>
                  </div>
                  <h3>{workspace.name}</h3>
                  {workspace.description && <p>{workspace.description}</p>}
                  {countsAvailable ? (
                    <span className={'rv-pill ' + (count > 0 ? 'rv-orange' : 'rv-green')}>
                      <Status size={14} aria-hidden="true" /> {count > 0 ? count + (count === 1 ? ' pendente' : ' pendentes') : 'Em dia'}
                    </span>
                  ) : (
                    <span className="rv-pill">Contagem indisponível</span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
