import Link from 'next/link'
import { ArrowUpRight, ShieldAlert, ShieldCheck } from 'lucide-react'

interface WorkspaceHealth {
  id: string
  name: string
  description: string | null
  score: number
  status: 'green' | 'yellow' | 'red'
  totalCards: number
  reviewedCards: number
}

const statusLabels = {
  green: { label: 'Saudável', style: 'dh-positive', icon: ShieldCheck },
  yellow: { label: 'Atenção', style: 'dh-warning', icon: ShieldAlert },
  red: { label: 'Crítico', style: 'dh-danger', icon: ShieldAlert },
}

export default function WorkspaceHealthGrid({ healths }: { healths: WorkspaceHealth[] }) {
  const active = healths.slice(0, 6)
  if (active.length === 0) return null

  return (
    <section aria-labelledby="dashboard-workspaces">
      <h2 id="dashboard-workspaces" className="dh-heading">Retenção por workspace</h2>
      <div className="dh-workspace-grid mt-3">
        {active.map((workspace) => {
          const { label, style, icon: StatusIcon } = statusLabels[workspace.status]
          return (
            <Link key={workspace.id} href={'/dashboard/' + workspace.id} className="dh-panel dh-pad dh-workspace-card">
              <div className="dh-row dh-between">
                <h3 className="dh-title break-words min-w-0">{workspace.name}</h3>
                <ArrowUpRight size={16} className="dh-accent shrink-0" aria-hidden="true" />
              </div>
              {workspace.description && <p className="dh-caption line-clamp-2 mt-1">{workspace.description}</p>}
              <div className="dh-row dh-between mt-3">
                <p className="text-2xl font-semibold tabular-nums">{workspace.reviewedCards > 0 ? workspace.score + '%' : '—'}</p>
                {workspace.reviewedCards > 0
                  ? <span className={'dh-pill ' + style}><StatusIcon size={13} aria-hidden="true" /> {label}</span>
                  : <span className="dh-caption">Sem revisões</span>}
              </div>
              {workspace.reviewedCards > 0 && <progress className={'dh-progress mt-2 ' + style} value={workspace.score} max={100} aria-label={'Retenção de ' + workspace.name} />}
              <div className="dh-row dh-between dh-caption !text-xs mt-2">
                <span>{workspace.totalCards} cards</span><span>{workspace.reviewedCards} revisados</span>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
