'use client'

import Link from 'next/link'
import { CircleAlert, RefreshCw } from '@/components/icons'
import { questionsPath } from '@/lib/questions/practice'

export default function QuestionsError() {
  return (
    <div className="q-shell q-practice">
      <div className="q-panel q-empty">
        <CircleAlert size={25} aria-hidden="true" />
        <h1 className="q-section-title">Não foi possível carregar esta tela</h1>
        <p className="q-subtitle">Confira a conexão e tente novamente.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => window.location.reload()} className="q-button q-button-primary"><RefreshCw size={16} aria-hidden="true" /> Tentar novamente</button>
          <Link href={questionsPath} prefetch={false} className="q-button">Catálogo de questões</Link>
        </div>
      </div>
    </div>
  )
}
