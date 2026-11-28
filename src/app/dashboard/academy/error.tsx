'use client'

import Link from 'next/link'

export default function AcademyError({ reset }: { reset: () => void }) {
  return <section className="ac-panel ac-empty"><h1>Não foi possível abrir a Academy</h1>
    <p>Tente recarregar para recuperar sua jornada.</p>
    <button className="ac-btn ac-primary" onClick={reset}>Tentar novamente</button>
    <Link className="ac-btn" href="/dashboard">Voltar ao dashboard</Link>
  </section>
}
