import Image from 'next/image'
import { AlertTriangle, Shield, Sparkles } from 'lucide-react'
import { profileLevelProgress } from '@/lib/profile'

interface LevelProgressCardProps {
  totalXp: number
  currentLevel: number
  streakShields: number
  isJeopardy?: boolean
}

export default function LevelProgressCard({ totalXp, currentLevel, streakShields, isJeopardy }: LevelProgressCardProps) {
  const { value: progress, target: range } = profileLevelProgress(currentLevel, totalXp)

  return (
    <article className="dh-panel dh-pad dh-level-card">
      <div className="dh-row dh-between">
        <div className="dh-row">
          <span className="dh-icon"><Sparkles size={16} aria-hidden="true" /></span>
          <h3 className="dh-title">Seu progresso</h3>
        </div>
        <span className="dh-caption tabular-nums">{totalXp} XP total</span>
      </div>
      <div className="dh-row dh-between dh-level-number">
        <strong>Nível {currentLevel}</strong>
        <Image src="/images/streak_shield_3d.png" width={40} height={40} alt="" />
      </div>
      <progress className="dh-progress mt-3" value={progress} max={range} aria-label="Progresso para o próximo nível" />
      <div className="dh-row dh-between dh-caption !text-xs mt-1">
        <span className="tabular-nums">{progress} / {range} XP</span>
        <span>Nível {currentLevel + 1}</span>
      </div>
      <div className="dh-row dh-between dh-divider">
        <span className="dh-row dh-caption !text-xs"><Shield size={15} aria-hidden="true" /> {streakShields} {streakShields === 1 ? 'escudo' : 'escudos'}</span>
        {isJeopardy ? (
          <span className="dh-pill dh-danger"><AlertTriangle size={13} aria-hidden="true" /> Sequência em risco</span>
        ) : (
          <span className="dh-pill dh-positive">Sem risco imediato</span>
        )}
      </div>
    </article>
  )
}
