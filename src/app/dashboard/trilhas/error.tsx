'use client'

import Link from 'next/link'
import { CircleAlert } from '@/components/icons'
import { learningPath } from '@/lib/learning/progress'

export default function LearningError({ reset }: { reset: () => void }) {
  return (
    <div className="lp-panel lp-empty">
      <CircleAlert size={27} aria-hidden="true" />
      <h1>Não foi possível carregar as trilhas</h1>
      <p className="lp-muted">Confira a conexão e tente novamente.</p>
      <div className="lp-card-actions">
        <button type="button" className="lp-button lp-primary" onClick={reset}>Tentar novamente</button>
        <Link href={learningPath} prefetch={false} className="lp-button">Catálogo de trilhas</Link>
      </div>
    </div>
  )
}
