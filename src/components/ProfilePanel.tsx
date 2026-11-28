'use client'

import { useRef, useState } from 'react'
import { ArrowRight, Check, Pencil, Shield, Sparkles, Trophy, X } from '@/components/icons'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { generatePlayerTitle, updatePlayerAvatar } from '@/actions/achievements'
import type { getProfileStats } from '@/actions/stats'
import AvatarFace from '@/components/AvatarFace'
import { profileLevelProgress } from '@/lib/profile'
import { ACHIEVEMENTS } from '@/types/achievements'
import { AVATAR_ICONS } from '@/utils/avatars'

type ProfileData = Awaited<ReturnType<typeof getProfileStats>>
type AvatarKey = keyof typeof AVATAR_ICONS

const avatarLabels: Record<AvatarKey, string> = {
  BookOpen: 'Livro', BrainCircuit: 'Cérebro', Target: 'Alvo', Zap: 'Raio', Rocket: 'Foguete', Crown: 'Coroa',
  Microscope: 'Microscópio', Palette: 'Paleta', Flame: 'Chama', Gamepad: 'Controle', Compass: 'Bússola', Trophy: 'Troféu',
}
const numbers = new Intl.NumberFormat('pt-BR')

function WeeklyActivity({ days }: { days: ProfileData['recentActivity'] }) {
  const total = days.reduce((sum, day) => sum + day.reviews, 0)
  const scale = Math.max(1, ...days.map((day) => day.reviews))

  return (
    <section className="pf-panel pf-section" aria-labelledby="perfil-atividade">
      <div className="pf-section-heading">
        <div>
          <h2 id="perfil-atividade">Atividade dos últimos 7 dias</h2>
          <p>Flashcards revisados por dia</p>
        </div>
        <span className="pf-pill">{numbers.format(total)} {total === 1 ? 'revisão' : 'revisões'}</span>
      </div>
      <ul className="pf-chart" aria-label="Revisões por dia">
        {days.map((day) => (
          <li key={day.date} aria-label={day.label + ' · ' + day.reviews + (day.reviews === 1 ? ' revisão' : ' revisões')}>
            <div className="pf-chart-track" aria-hidden="true">
              <div className="pf-chart-bar" style={{ height: (day.reviews / scale) * 100 + '%' }} />
            </div>
            <span className="pf-chart-value" aria-hidden="true">{numbers.format(day.reviews)}</span>
            <time dateTime={day.date} aria-hidden="true">{day.weekday}</time>
          </li>
        ))}
      </ul>
      {total === 0 && <p className="pf-muted">As próximas revisões aparecerão neste gráfico.</p>}
    </section>
  )
}

export default function ProfilePanel({ initialData: data }: { initialData: ProfileData }) {
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const avatarTrigger = useRef<HTMLButtonElement>(null)
  const [avatarOverride, setAvatarOverride] = useState<AvatarKey | null>(null)
  const [titleOverride, setTitleOverride] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [savingAvatar, setSavingAvatar] = useState<AvatarKey | null>(null)
  const [avatarError, setAvatarError] = useState('')
  const [titleError, setTitleError] = useState('')
  const [avatarNotice, setAvatarNotice] = useState('')
  const avatarIcon = avatarOverride ?? data.user.avatarIcon
  const title = titleOverride ?? data.user.playerTitle
  const level = profileLevelProgress(data.currentLevel, data.totalXp)
  const unlocked = [...new Set(data.unlockedAchievements)].filter((id) => Object.hasOwn(ACHIEVEMENTS, id))
  const recentTrophies = unlocked.slice(-4).reverse().map((id) => ACHIEVEMENTS[id])
  const totalTrophies = Object.keys(ACHIEVEMENTS).length
  const metrics = [
    { label: 'Sequência atual', value: data.streak, suffix: data.streak === 1 ? ' dia' : ' dias', detail: 'Recorde de ' + data.maxStreak + (data.maxStreak === 1 ? ' dia' : ' dias'), image: '/images/stat_streak_3d.png', tone: 'gold' },
    { label: 'Revisões', value: data.cardsReviewed, detail: 'Flashcards revisados', image: '/images/profile_revisoes_3d.png', tone: 'violet' },
    { label: 'Notas criadas', value: data.notesCreated, image: '/images/profile_notas_3d.png', tone: 'green' },
    { label: 'Simulados perfeitos', value: data.perfectExams, detail: 'Com 100% de acertos', image: '/images/profile_gabaritadas_3d.png', tone: 'cyan' },
  ]

  async function regenerateTitle() {
    if (generating) return
    setGenerating(true)
    setTitleError('')
    try {
      setTitleOverride(await generatePlayerTitle(true))
    } catch {
      setTitleError('Não foi possível gerar um título agora. Tente novamente.')
    } finally {
      setGenerating(false)
    }
  }

  async function selectAvatar(icon: AvatarKey) {
    if (savingAvatar) return
    setSavingAvatar(icon)
    setAvatarError('')
    try {
      const result = await updatePlayerAvatar(icon)
      if (!result.success) {
        setAvatarError('Não foi possível salvar o avatar. Tente novamente.')
        return
      }
      setAvatarOverride(icon)
      setAvatarNotice('Avatar atualizado.')
      dialog.current?.close()
      router.refresh()
    } catch {
      setAvatarError('Não foi possível salvar o avatar. Tente novamente.')
    } finally {
      setSavingAvatar(null)
    }
  }

  return (
    <>
      <header className="pf-hero">
        <div className="pf-cover" aria-hidden="true">
          <Image src="/images/profile_banner.jpg" fill alt="" sizes="(max-width: 768px) 90vw, 1150px" preload />
        </div>
        <div className="pf-hero-layout">
          <div className="pf-identity">
            <div className="pf-avatar" data-rank={data.currentLevel > 15 ? 'gold' : data.currentLevel > 5 ? 'violet' : 'base'}>
              <AvatarFace name={data.user.name} avatarUrl={data.user.avatarUrl} avatarIcon={avatarIcon} size={112} />
            </div>
            <div className="pf-identity-copy">
              <h1>Meu perfil</h1>
              <p className="pf-name">{data.user.name}</p>
              <p className="pf-title" aria-live="polite"><Trophy size={16} aria-hidden="true" /> {title}</p>
              <div className="pf-actions">
                <button ref={avatarTrigger} type="button" className="pf-button" aria-haspopup="dialog" onClick={() => {
                  setAvatarNotice('')
                  dialog.current?.showModal()
                }}>
                  <Pencil size={15} aria-hidden="true" /> Trocar avatar
                </button>
                <button type="button" className="pf-button pf-quiet" disabled={generating} onClick={regenerateTitle}>
                  <Sparkles size={15} aria-hidden="true" /> {generating ? 'Gerando título…' : 'Gerar título com IA'}
                </button>
              </div>
              {titleError && <p className="pf-inline-error" role="alert">{titleError}</p>}
              <p className="sr-only" role="status">{avatarNotice}</p>
            </div>
          </div>
          <section className="pf-level" aria-labelledby="perfil-nivel">
            <div className="pf-section-heading">
              <h2 id="perfil-nivel">Nível {data.currentLevel}</h2>
              <span>{numbers.format(data.totalXp)} XP total</span>
            </div>
            <progress className="pf-progress" value={level.value} max={level.target} aria-label={'Progresso para o nível ' + (data.currentLevel + 1)} />
            <div className="pf-section-heading">
              <span>{numbers.format(level.value)} / {numbers.format(level.target)} XP</span>
              <span>Nível {data.currentLevel + 1}</span>
            </div>
          </section>
        </div>
      </header>

      <section className="pf-section pf-metrics-section" aria-labelledby="perfil-estatisticas">
        <h2 id="perfil-estatisticas">Meu progresso</h2>
        <dl className="pf-metrics">
          {metrics.map(({ label, value, suffix, detail, image, tone }) => (
            <div className="pf-panel pf-metric" key={label} data-tone={tone}>
              <dt>{label}<Image src={image} width={48} height={48} alt="" /></dt>
              <dd><strong>{numbers.format(value)}</strong>{suffix && <span>{suffix}</span>}</dd>
              {detail && <dd className="pf-muted">{detail}</dd>}
            </div>
          ))}
        </dl>
      </section>

      <div className="pf-details">
        <WeeklyActivity days={data.recentActivity} />

        <section className="pf-panel pf-section" aria-labelledby="perfil-conquistas">
          <div className="pf-section-heading">
            <div>
              <h2 id="perfil-conquistas">Conquistas</h2>
              <p>{unlocked.length} de {totalTrophies} desbloqueadas</p>
            </div>
            <Link href="/dashboard/conquistas" className="pf-button pf-quiet">Ver galeria <ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
          <progress className="pf-progress" value={unlocked.length} max={totalTrophies} aria-label="Troféus desbloqueados" />
          {recentTrophies.length ? (
            <ul className="pf-trophies" aria-label="Conquistas recentes">
              {recentTrophies.map((trophy) => (
                <li key={trophy.id} data-tier={trophy.tier}>
                  <span className="pf-trophy-icon">
                    {trophy.imageUrl ? <Image src={trophy.imageUrl} height={36} width={36} alt="" /> : <Trophy size={17} aria-hidden="true" />}
                  </span>
                  <div>
                    <h3>{trophy.title.replace(/^[^\p{L}]+/u, '')}</h3>
                    <p className="pf-muted">{trophy.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pf-muted">Suas primeiras conquistas vão aparecer aqui.</p>
          )}
        </section>
      </div>

      <section className="pf-panel pf-protection" aria-labelledby="perfil-escudo">
        <Image src="/images/streak_shield_3d.png" width={62} height={62} alt="" />
        <div>
          <h2 id="perfil-escudo">Escudos de sequência</h2>
          <p className="pf-muted">Protegem sua sequência se você deixar de estudar por um dia.</p>
        </div>
        <span className="pf-pill"><Shield size={15} aria-hidden="true" /> {data.streakShields} {data.streakShields === 1 ? 'ativo' : 'ativos'}</span>
      </section>

      <dialog ref={dialog} className="pf-dialog" aria-labelledby="avatar-modal-title" onClose={() => {
        setAvatarError('')
        avatarTrigger.current?.focus()
      }} onCancel={(event) => { if (savingAvatar) event.preventDefault() }}>
        <div className="pf-section-heading">
          <h2 id="avatar-modal-title">Escolha seu avatar</h2>
          <button type="button" className="pf-button pf-quiet pf-close" onClick={() => dialog.current?.close()}
            aria-label="Fechar seleção de avatar" disabled={savingAvatar !== null}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {avatarError && <p className="pf-error" role="alert">{avatarError}</p>}
        <div className="pf-avatar-options" aria-busy={savingAvatar !== null}>
          {(Object.entries(AVATAR_ICONS) as [AvatarKey, typeof AVATAR_ICONS[AvatarKey]][]).map(([key, Icon]) => {
            const active = avatarIcon === key
            return (
              <button type="button" key={key} className="pf-avatar-option" aria-pressed={active}
                onClick={() => selectAvatar(key)} disabled={savingAvatar !== null}
              >
                <Icon size={23} aria-hidden="true" />
                <span>{avatarLabels[key]}</span>
                {active && <Check size={13} className="pf-option-check" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
        {savingAvatar && <p className="pf-muted" role="status">Salvando avatar…</p>}
      </dialog>
    </>
  )
}
