import { Layers } from 'lucide-react'
import { LearningPathCard } from '@/components/learning/LearningPresentation'
import { getLearningCatalog, LearningSchemaUnavailableError } from '@/lib/learning/server'
import { getQuestionSession } from '@/lib/questions/server'

export const metadata = { title: 'Trilhas de estudo · OmniMind' }

export default async function LearningCatalogPage() {
  const session = await getQuestionSession()
  let paths: Awaited<ReturnType<typeof getLearningCatalog>>
  try {
    paths = await getLearningCatalog(session)
  } catch (error) {
    if (!(error instanceof LearningSchemaUnavailableError)) throw error
    return (
      <div className="lp-panel lp-empty">
        <Layers size={28} aria-hidden="true" />
        <h1>Trilhas indisponíveis neste ambiente</h1>
        <p className="lp-muted">Confira se as migrations de Trilhas e da coleção SQL foram aplicadas ao banco de teste.</p>
      </div>
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
    </>
  )
}
