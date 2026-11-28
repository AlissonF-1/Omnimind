'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowDown, ArrowRight, Award, Brain, Calendar, Check, Flame, FolderHeart, GraduationCap,
  Lock, Moon, Sparkles, Sun, Swords, Target, Trophy, Volume2,
} from '@/components/icons'
import type { Collection, CollectionItem } from '@/app/dashboard/conquistas/collection'
import { playTrophySound } from '@/utils/audio'

const icons = { Award, Brain, Calendar, Flame, FolderHeart, GraduationCap, Lock, Moon, Sparkles, Sun, Swords, Trophy }
const tierNames = { bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro', diamante: 'Diamante' }
const filters = [
  { id: 'all', label: 'Todas' },
  { id: 'earned', label: 'Desbloqueadas' },
  { id: 'pending', label: 'Em andamento' },
] as const
type Filter = typeof filters[number]['id']

function CollectionProgress({ value, max, label }: { value: number; max: number; label: string }) {
  return <progress className="ag-progress" value={Math.min(value, max)} max={max} aria-label={label} />
}

function NextGoal({ next, workspaceId }: { next: Collection['next']; workspaceId?: string }) {
  if (!next) return null

  const { item, progress } = next
  const actions = {
    reviews: { href: '/dashboard/revisoes', label: 'Abrir revisões' },
    streak: { href: '/dashboard/revisoes', label: 'Abrir revisões' },
    exams: { href: '/dashboard/calendario', label: 'Abrir calendário' },
    notes: workspaceId
      ? { href: '/dashboard/' + encodeURIComponent(workspaceId), label: 'Abrir workspace' }
      : { href: '/dashboard', label: 'Ir para o painel' },
    tutor: null,
    simulations: null,
  } as const
  const action = actions[progress.key]

  return (
    <section className="ag-surface ag-next" aria-labelledby="proxima-conquista">
      <span className="ag-icon"><Target size={22} aria-hidden="true" /></span>
      <div className="ag-next-copy">
        <h2 id="proxima-conquista" className="ag-kicker">Próxima conquista</h2>
        <h3>{item.title}</h3>
        <p>{next.remainingLabel}</p>
      </div>
      <div className="ag-next-progress">
        <p>{progress.value} / {progress.target}</p>
        <CollectionProgress value={progress.value} max={progress.target} label={'Progresso de ' + item.title} />
      </div>
      {action ? (
        <Link href={action.href} className="ag-button">{action.label} <ArrowRight size={16} aria-hidden="true" /></Link>
      ) : progress.key === 'tutor' && (
        <button type="button" className="ag-button" onClick={() => window.dispatchEvent(new Event('open-chat'))}>
          Abrir assistente <ArrowRight size={16} aria-hidden="true" />
        </button>
      )}
    </section>
  )
}

function CollectionEntry({ item, compact }: { item: CollectionItem; compact: boolean }) {
  const Icon = icons[item.icon as keyof typeof icons] ?? Trophy
  const progress = item.progress
  const title = compact && item.tier ? tierNames[item.tier] : item.title

  return (
    <li className="ag-entry" data-tier={item.tier} data-earned={item.unlocked}>
      <span className="ag-entry-icon"><Icon size={17} aria-hidden="true" /></span>
      <div className="ag-entry-copy">
        <h4>{title}</h4>
        {!compact && <p>{item.description}</p>}
        {progress && !item.unlocked && (
          <CollectionProgress value={progress.value} max={progress.target} label={'Progresso de ' + item.title} />
        )}
      </div>
      <span className="ag-entry-status">
        {item.unlocked ? (
          <span className="ag-earned"><Check size={17} aria-hidden="true" /><span className="sr-only">Desbloqueada</span></span>
        ) : progress ? (
          <span>{Math.min(progress.value, progress.target)}/{progress.target}</span>
        ) : (
          <span><Lock size={14} aria-hidden="true" /><span className="sr-only">Bloqueada</span></span>
        )}
      </span>
    </li>
  )
}

export default function AchievementsPanel({ collection, workspaceId }: { collection: Collection; workspaceId?: string }) {
  const [filter, setFilter] = useState<Filter>('all')
  const { trophy, total, unlockedCount } = collection
  const families = collection.families
    .map((family) => ({
      ...family,
      items: family.items.filter((item) => filter === 'all' || (filter === 'earned' ? item.unlocked : !item.unlocked && !item.hidden)),
    }))
    .filter((family) => family.items.length > 0)

  return (
    <>
      <header className="ag-hero">
        <div className="ag-hero-copy">
          <span className="ag-hero-mark"><Trophy size={26} mode="color" aria-hidden="true" /></span>
          <h1>Minhas conquistas</h1>
          <p>Cada revisão, nota e desafio deixa sua marca.</p>
          <div className="ag-hero-progress">
            <div><strong>{unlockedCount}</strong><span> de {total} troféus conquistados</span></div>
            <CollectionProgress value={unlockedCount} max={total} label="Troféus conquistados" />
          </div>
          <a className="ag-button ag-primary" href="#colecao-conquistas">Ver coleção <ArrowDown size={16} aria-hidden="true" /></a>
        </div>

        <div className="ag-showcase" data-earned={Boolean(trophy)}>
          <div className="ag-pedestal" aria-hidden="true">
            {trophy?.imageUrl
              ? <Image src={trophy.imageUrl} alt="" fill sizes="(max-width: 640px) 190px, 240px" preload />
              : <Trophy className="ag-silhouette" size={82} mode="color" strokeWidth={1.1} />}
          </div>
          <div className="ag-showcase-copy">
            <p className="ag-kicker">{trophy ? 'Diamante · Desbloqueado' : 'Desafio secreto'}</p>
            <h2>{trophy ? 'Prêmio Nobel' : 'Troféu secreto'}</h2>
            <p>{trophy ? trophy.description : 'Experimente explicar um assunto com suas próprias palavras.'}</p>
            {!trophy && <Link href="/dashboard/feynman" className="ag-showcase-link">Explorar Feynman Sandbox <ArrowRight size={14} aria-hidden="true" /></Link>}
          </div>
        </div>
      </header>

      <NextGoal next={collection.next} workspaceId={workspaceId} />

      <section className="ag-collection" id="colecao-conquistas" tabIndex={-1} aria-labelledby="titulo-colecao">
        <div className="ag-section-heading">
          <h2 id="titulo-colecao">Coleção de troféus</h2>
          <button type="button" className="ag-button ag-sound" onClick={playTrophySound}>
            <Volume2 size={16} aria-hidden="true" /> Testar som
          </button>
        </div>
        <div className="ag-filters" role="group" aria-label="Filtrar coleção">
          {filters.map(({ id, label }) => (
            <button key={id} type="button" className="ag-filter" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
        {families.length > 0 ? (
          <div className="ag-grid">
            {families.map((family) => {
              const Icon = icons[family.icon]
              const compact = family.id === 'notas' || family.id === 'simulados' || family.id === 'tutor'
              const hiddenCount = family.items.filter((item) => item.hidden).length
              return (
                <article className="ag-surface ag-family" key={family.id}>
                  <div className="ag-family-heading">
                    <span className="ag-icon"><Icon size={20} aria-hidden="true" /></span>
                    <div><h3>{family.title}</h3><p>{family.description}</p></div>
                  </div>
                  <ul>
                    {family.items.filter((item) => !item.hidden).map((item) => <CollectionEntry key={item.id} item={item} compact={compact} />)}
                    {hiddenCount > 0 && (
                      <li className="ag-entry ag-hidden-entry">
                        <span className="ag-entry-icon"><Lock size={17} aria-hidden="true" /></span>
                        <div className="ag-entry-copy">
                          <p>{hiddenCount === 1 ? '1 conquista secreta' : hiddenCount + ' conquistas secretas'}</p>
                        </div>
                      </li>
                    )}
                  </ul>
                </article>
              )
            })}
          </div>
        ) : (
          <p role="status" className="ag-surface ag-empty">{filter === 'earned' ? 'Suas conquistas desbloqueadas vão aparecer aqui.' : 'Nenhuma conquista em andamento.'}</p>
        )}
      </section>
    </>
  )
}
