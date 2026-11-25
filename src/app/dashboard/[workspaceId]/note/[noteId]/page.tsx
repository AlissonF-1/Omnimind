import { getNoteById } from '@/actions/notes'
import MarkdownEditor from '@/components/MarkdownEditor'
import CollapsiblePdfImporter from '@/components/CollapsiblePdfImporter'
import EditableNoteTitle from '@/components/EditableNoteTitle'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarDays, FileText, Layers, Play } from 'lucide-react'
import { Suspense } from 'react'
import './note.css'

export const dynamic = 'force-dynamic'

// Função simples para exibir tempo relativo (sem dependências)
function timeAgo(date: Date): string {
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return 'agora mesmo'
  const diffInMinutes = Math.floor(diffInSeconds / 60)
  if (diffInMinutes < 60) return `há ${diffInMinutes} minuto${diffInMinutes > 1 ? 's' : ''}`
  const diffInHours = Math.floor(diffInMinutes / 60)
  if (diffInHours < 24) return `há ${diffInHours} hora${diffInHours > 1 ? 's' : ''}`
  const diffInDays = Math.floor(diffInHours / 24)
  if (diffInDays < 30) return `há ${diffInDays} dia${diffInDays > 1 ? 's' : ''}`
  const diffInMonths = Math.floor(diffInDays / 30)
  if (diffInMonths < 12) return `há ${diffInMonths} mês${diffInMonths > 1 ? 'es' : ''}`
  const diffInYears = Math.floor(diffInMonths / 12)
  return `há ${diffInYears} ano${diffInYears > 1 ? 's' : ''}`
}

export default async function NotePage({
  params,
}: {
  params: Promise<{ workspaceId: string; noteId: string }>
}) {
  const resolvedParams = await params
  const note = await getNoteById(resolvedParams.noteId, resolvedParams.workspaceId)

  if (!note) {
    notFound()
  }

  const updatedAt = note.updated_at ? new Date(note.updated_at) : null
  const timeAgoText = updatedAt ? timeAgo(updatedAt) : null

  return (
    <article className="nt-page" aria-label="Anotação">
      <nav aria-label="Navegação da anotação">
        <Link href={`/dashboard/${resolvedParams.workspaceId}`} className="nt-back">
          <ArrowLeft size={16} aria-hidden="true" /> Voltar ao workspace
        </Link>
      </nav>
      <header className="nt-hero">
        <div className="nt-heading">
          <span className="nt-hero-icon"><FileText size={25} aria-hidden="true" /></span>
          <div className="nt-heading-content">
            <h1 className="sr-only">Editor da anotação</h1>
            <EditableNoteTitle noteId={note.id} initialTitle={note.title} />
            {timeAgoText && (
              <p className="nt-date">
                <CalendarDays size={14} aria-hidden="true" /> Atualizado {timeAgoText}
              </p>
            )}
          </div>
        </div>
        <div className="nt-actions">
          <Link
            href={`/dashboard/${resolvedParams.workspaceId}/note/${resolvedParams.noteId}/flashcards`}
            className="nt-button"
          >
            <Layers size={16} aria-hidden="true" /> Gerenciar flashcards
          </Link>
          <Link
            href={`/dashboard/revisoes?workspaceId=${resolvedParams.workspaceId}&noteId=${resolvedParams.noteId}`}
            className="nt-button nt-primary"
          >
            <Play size={16} aria-hidden="true" /> Estudar agora
          </Link>
        </div>
      </header>

      <CollapsiblePdfImporter workspaceId={resolvedParams.workspaceId} />

      <section className="nt-writing" aria-label="Área de escrita">
        <Suspense
          fallback={
            <div className="nt-editor-loading" role="status">
              <FileText size={22} aria-hidden="true" />
              <p>Carregando editor…</p>
            </div>
          }
        >
          <MarkdownEditor initialNote={note} />
        </Suspense>
      </section>
    </article>
  )
}
