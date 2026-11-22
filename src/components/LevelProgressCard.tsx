import { AlertTriangle, Shield, Sparkles } from 'lucide-react'

interface LevelProgressCardProps {
  totalXp: number
  currentLevel: number
  streakShields: number
  isJeopardy?: boolean
}

export default function LevelProgressCard({ totalXp, currentLevel, streakShields, isJeopardy }: LevelProgressCardProps) {
  const currentThreshold = Math.pow(currentLevel - 1, 2) * 5
  const nextThreshold = Math.pow(currentLevel, 2) * 5
  const range = nextThreshold - currentThreshold
  const progress = Math.min(Math.max(totalXp - currentThreshold, 0), range)

  return (
    <article className="dh-panel dh-pad">
      <div className="dh-row dh-between">
        <div className="dh-row">
          <span className="dh-icon"><Sparkles size={16} aria-hidden="true" /></span>
          <h3 className="dh-title">Nível {currentLevel}</h3>
        </div>
        <span className="dh-caption tabular-nums">{totalXp} XP total</span>
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
