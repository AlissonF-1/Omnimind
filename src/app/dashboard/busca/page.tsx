import SemanticSearch from '@/components/SemanticSearch'
import { getWorkspaces } from '@/actions/workspaces'
import { Suspense } from 'react'
import { Search, Loader2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

// Componente de fallback para carregamento
function SearchFallback() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <Loader2 className="size-8 animate-spin text-primary" />
      <p className="mt-4 text-sm text-text-muted">Carregando workspaces...</p>
    </div>
  )
}

// Componente principal (Server Component)
export default async function BuscaPage() {
  const workspaces = await getWorkspaces()

  return (
    <div className="page-container px-4 sm:px-6 py-4 sm:py-6">
      {/* Cabeçalho da página */}
      <header className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Search className="size-5 text-primary" />
          <h1 className="text-2xl sm:text-3xl font-bold text-text-strong">
            Busca Semântica
          </h1>
        </div>
        <p className="text-sm text-text-medium max-w-2xl">
          Encontre conhecimento por significado — notas, flashcards, analogias e mnemônicos.
        </p>
      </header>

      {/* Componente de busca com suspense para carregamento */}
      <Suspense fallback={<SearchFallback />}>
        <SemanticSearch workspaces={workspaces} />
      </Suspense>

      {/* Mensagem caso não haja workspaces */}
      {workspaces.length === 0 && (
        <div className="mt-8 panel-muted py-12 text-center rounded-2xl">
          <p className="text-sm font-medium text-text-strong">
            Nenhum workspace disponível
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Crie um workspace para começar a usar a busca semântica.
          </p>
        </div>
      )}
    </div>
  )
}