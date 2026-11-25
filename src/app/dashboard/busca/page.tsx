import { Suspense } from 'react'
import Image from 'next/image'
import { FolderPlus, Loader2, ScanSearch } from 'lucide-react'
import { getWorkspaces } from '@/actions/workspaces'
import SemanticSearch from '@/components/SemanticSearch'
import './search.css'

export const dynamic = 'force-dynamic'

async function SearchContent() {
  const workspaces = await getWorkspaces()
  return (
    <>
      <SemanticSearch workspaces={workspaces} />
      {workspaces.length === 0 && (
        <section className="ss-panel ss-empty">
          <span className="ss-empty-icon"><FolderPlus size={24} aria-hidden="true" /></span>
          <h2>Nenhum workspace disponível</h2>
          <p>Crie um workspace no menu lateral para organizar o material que você quer encontrar aqui.</p>
        </section>
      )}
    </>
  )
}

export default function BuscaPage() {
  return (
    <div className="ss-page">
      <header className="ss-hero">
        <div className="ss-hero-art" aria-hidden="true">
          <Image src="/images/dashboard/brain.webp" alt="" fill sizes="(max-width: 640px) 40vw, 510px" />
        </div>
        <div className="ss-hero-copy">
          <span className="ss-hero-icon"><ScanSearch size={25} aria-hidden="true" /></span>
          <div>
            <h1>Busca semântica</h1>
            <p>Encontre ideias nas suas notas, flashcards, analogias e mnemônicos pelo significado.</p>
          </div>
        </div>
      </header>
      <Suspense fallback={<div className="ss-panel ss-load" role="status"><Loader2 size={20} className="ss-spinner" aria-hidden="true" /> Carregando workspaces…</div>}>
        <SearchContent />
      </Suspense>
    </div>
  )
}
