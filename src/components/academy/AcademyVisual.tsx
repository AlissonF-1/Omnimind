import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Check, LockKeyhole } from '@/components/icons'
import type { CSSProperties, ReactNode } from 'react'
import { academyPath, type AcademyFormationProgress } from '@/lib/academy/contracts'
import { academyExploreHref, formationLabels, formationSelection } from '@/lib/academy/presentation'

const kit = '/academy/design-kit/'

export function KitArt({ asset, className, width = 64, height = width, eager = false }: {
  asset: string; className?: string; width?: number; height?: number; eager?: boolean
}) {
  const category = asset.split('/')[0]
  const mask = category === 'activities' || category === 'mentor' ? category : undefined
  return <Image src={kit + asset + '.webp'} width={width} height={height}
    alt="" className={className} data-art-mask={mask} sizes={width + 'px'} loading={eager ? 'eager' : 'lazy'} />
}

export function AcademyHero({ title, description, scene, pose, actions, eyebrow = 'OmniMind Academy' }: {
  title: string; description?: string; scene?: string; pose?: string; actions?: ReactNode; eyebrow?: string
}) {
  return <header className="ac3-hero" style={{ '--scene': scene ? 'url("' + kit + 'scenes/' + scene + '.webp")' : 'none' } as CSSProperties}>
    <div className="ac3-copy">
      <span className="ac3-eyebrow">{eyebrow}</span><h1>{title}</h1>
      {description && <p>{description}</p>}
      {actions && <div className="ac3-actions">{actions}</div>}
    </div>
    {pose && <KitArt asset={'mentor/' + pose} className="ac3-heroart" width={192} height={142} eager />}
  </header>
}

export function AcademyPanel({ title, children, action, className = '', id }: {
  title: string; children: ReactNode; action?: ReactNode; className?: string; id?: string
}) {
  return <section className={'ac3-panel ' + className} id={id}>
    <header className="ac3-sectionhead"><h2>{title}</h2>{action}</header>{children}
  </section>
}

export function Meter({ value, total, label }: { value: number; total: number; label: string }) {
  return <progress className="ac3-bar" value={value} max={Math.max(1, total)} aria-label={label + ', ' + value + ' de ' + total} />
}

export function AcademyProgressPanel({ title = 'Seu progresso', value, total, reviews }: {
  title?: string; value: number; total: number; reviews: number
}) {
  const percent = total ? Math.round(value / total * 100) : 0
  return <AcademyPanel title={title}>
    <div className="ac3-metrics">
      <div className="ac3-metric"><strong>{value}</strong><small>Aulas concluídas</small></div>
      <div className="ac3-metric"><strong>{total}</strong><small>Aulas publicadas</small></div>
      <div className="ac3-metric"><strong>{percent}%</strong><small>Progresso</small></div>
    </div>
    <Meter value={value} total={total} label={title} />
    <small>{reviews === 0 ? 'Nenhuma revisão pendente' : reviews === 1 ? '1 revisão pendente' : reviews + ' revisões pendentes'}</small>
  </AcademyPanel>
}

export function AcademyMentorPanel({ pose, children }: { pose: string; children: ReactNode }) {
  return <AcademyPanel title="Mentor OmniMind">
    <div className="ac3-mentor"><KitArt asset={'mentor/' + pose} width={77} height={77} /><div className="ac3-mentor-copy">{children}</div></div>
  </AcademyPanel>
}

export function AcademyStatus({ label, tone }: { label: string; tone: string }) {
  return <span className={'ac3-badge' + (tone === 'complete' ? ' ac3-ok' : tone === 'locked' ? ' ac3-lock' : '')} data-tone={tone}>
    {tone === 'complete' && <Check size={12} aria-hidden="true" />}
    {tone === 'locked' && <LockKeyhole size={11} aria-hidden="true" />}
    {label}
  </span>
}

export function AcademyEmpty({ unavailable = false }: { unavailable?: boolean }) {
  return <section className="ac3-panel ac-empty">
    <KitArt asset="mentor/thinking" width={128} height={90} />
    <h1>{unavailable ? 'Academy indisponível neste ambiente' : 'Nenhuma formação publicada'}</h1>
    <Link className="ac3-button" href={unavailable ? '/dashboard/trilhas' : academyPath}>
      {unavailable ? 'Abrir Trilhas' : 'Voltar à Academy'} <ArrowRight size={15} aria-hidden="true" />
    </Link>
  </section>
}

export function FormationSwitch({ items, active, path, extra }: {
  items: AcademyFormationProgress[]; active: AcademyFormationProgress; path: string; extra?: Record<string, string>
}) {
  return <nav className="ac3-splitbar" aria-label="Formações disponíveis">
    {items.map((item) => <Link key={item.release.id + ':' + item.formation.id} prefetch={false}
      href={academyExploreHref(path, formationSelection(item), extra)} aria-current={item === active ? 'page' : undefined}
      className={'ac3-button' + (item === active ? ' ac3-selected' : '')}>
      {items.filter(({ formation }) => formation.kind === item.formation.kind).length > 1
        ? item.formation.title : formationLabels[item.formation.kind]}
    </Link>)}
  </nav>
}
