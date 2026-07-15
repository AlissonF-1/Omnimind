import { getNoteById } from '@/actions/notes'
import MarkdownEditor from '@/components/MarkdownEditor'
import CollapsiblePdfImporter from '@/components/CollapsiblePdfImporter'
import EditableNoteTitle from '@/components/EditableNoteTitle' // Importamos o novo componente
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Calendar, FileText, Layers } from 'lucide-react'
import { Suspense } from 'react'

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
    <div className="flex h-full w-full flex-col px-4 sm:px-6 py-4 sm:py-6">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/dashboard/${resolvedParams.workspaceId}`}
            className="btn-ghost shrink-0 p-2 sm:p-3"
            aria-label="Voltar para o workspace"
          >
            <ArrowLeft className="size-4 sm:size-5" />
            <span className="hidden sm:inline ml-1">Voltar</span>
          </Link>

          <span className="h-6 w-px bg-border shrink-0" aria-hidden="true" />

          <div className="min-w-0 flex-1 flex flex-col">
            {/* O h1 estático foi substituído pelo componente interativo */}
            <EditableNoteTitle noteId={note.id} initialTitle={note.title} />
            
            {timeAgoText && (
              <p className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
                <Calendar className="size-3" />
                <span>Atualizado {timeAgoText}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-success bg-success-soft/30 px-3 py-1.5 rounded-full border border-success/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
            </span>
            Salvo automaticamente
          </span>

          <Link
            href={`/dashboard/${resolvedParams.workspaceId}/note/${resolvedParams.noteId}/flashcards`}
            className="btn-primary text-sm px-3 py-2"
          >
            <Layers className="size-4" />
            <span className="hidden sm:inline">Gerenciar Flashcards</span>
            <span className="sm:hidden">Cards</span>
          </Link>

          <Link
            href={`/dashboard/revisoes?workspaceId=${resolvedParams.workspaceId}&noteId=${resolvedParams.noteId}`}
            className="btn-primary text-sm px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            Estudar Agora
          </Link>
        </div>
      </header>

      <CollapsiblePdfImporter workspaceId={resolvedParams.workspaceId} />

      <section className="flex-1 min-h-0">
        <Suspense
          fallback={
            <div className="panel h-full min-h-[400px] flex items-center justify-center">
              <div className="text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <p className="mt-4 text-sm text-text-muted">Carregando editor...</p>
              </div>
            </div>
          }
        >
          <MarkdownEditor initialNote={note} />
        </Suspense>
      </section>
    </div>
  )
}