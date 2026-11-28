import Link from 'next/link'
import { ConnectionsIcon, FeynmanIcon, Layers, Sparkles } from '@/components/icons'
import { LearningPathCard } from '@/components/learning/LearningPresentation'
import { assistantPath } from '@/lib/assistant/contracts'
import { getLearningCatalog, LearningSchemaUnavailableError } from '@/lib/learning/server'
import { getQuestionSession } from '@/lib/questions/server'
import { sqlLabPath } from '@/lib/sql-lab/catalog'

export const metadata = { title: 'Trilhas de estudo · OmniMind' }

function LearningTools() {
  return (
    <nav className="lp-tool-links" aria-labelledby="lp-tool-links-label">
      <h2 id="lp-tool-links-label">Ferramentas de estudo</h2>
      <Link href={assistantPath} prefetch={false} className="lp-button"><Sparkles size={16} aria-hidden="true" /> Assistente completo</Link>
      <Link href={assistantPath + '?treino=1'} prefetch={false} className="lp-button">Treino interativo</Link>
      <Link href={sqlLabPath} prefetch={false} className="lp-button">Laboratório SQL</Link>
      <Link href="/dashboard/feynman" prefetch={false} className="lp-button"><FeynmanIcon size={16} /> Feynman Sandbox</Link>
      <Link href="/dashboard/grafo" prefetch={false} className="lp-button"><ConnectionsIcon size={16} /> Rede de Conexões</Link>
    </nav>
  )
}

export default async function LearningCatalogPage() {
  const session = await getQuestionSession()
  let paths: Awaited<ReturnType<typeof getLearningCatalog>>
  try {
    paths = await getLearningCatalog(session)
  } catch (error) {
    if (!(error instanceof LearningSchemaUnavailableError)) throw error
    return (
      <>
        <div className="lp-panel lp-empty">
          <Layers size={28} aria-hidden="true" />
          <h1>Trilhas indisponíveis neste ambiente</h1>
          <p className="lp-muted">Confira se as migrations de Trilhas e da coleção SQL foram aplicadas ao banco de teste.</p>
        </div>
        <LearningTools />
      </>
    )
  }

  return (
    <>
      <header className="lp-catalog-header">
        <span className="lp-catalog-icon"><Layers size={29} aria-hidden="true" /></span>
        <div><h1>Trilhas de estudo</h1><p className="lp-muted">Aprenda por missões, pratique com questões e avance no seu ritmo.</p></div>
      </header>
      {paths.length ? (
        <ul className="lp-catalog-grid" aria-label="Trilhas publicadas">
          {paths.map((path) => <li key={path.id}><LearningPathCard path={path} /></li>)}
        </ul>
      ) : <div className="lp-panel lp-empty"><h2>O catálogo está vazio</h2><p className="lp-muted">As trilhas publicadas aparecem aqui.</p></div>}
      <LearningTools />
    </>
  )
}
