import { getNotes, createNote } from '@/actions/notes'
import { getWorkspaceById } from '@/actions/workspaces'
import { getWorkspaceFlashcardCounts } from '@/actions/stats'
import { redirect, notFound } from 'next/navigation'
import { FilePlus, FileText, Layers, Calendar, Archive, Sparkles } from 'lucide-react'
import SprintControl from '@/components/SprintControl'
import WorkspaceFilterBar from '@/components/WorkspaceFilterBar'
import WorkspaceNotesGrid from '@/components/WorkspaceNotesGrid'

export const dynamic = 'force-dynamic'

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ sort?: string; search?: string }>
}) {
  const resolvedParams = await params
  const searchParamsObj = await searchParams
  const workspaceId = resolvedParams.workspaceId

  const [workspace, notesRes, flashcardCounts] = await Promise.all([
    getWorkspaceById(workspaceId),
    getNotes(workspaceId),
    getWorkspaceFlashcardCounts(workspaceId)
  ])

  if (!workspace) notFound()
  let notes = notesRes

  // Filtro por busca (case-insensitive)
  if (searchParamsObj.search) {
    const searchLower = searchParamsObj.search.toLowerCase()
    notes = notes.filter(note =>
      note.title.toLowerCase().includes(searchLower)
    )
  }

  // Ordenação
  const sortType = searchParamsObj.sort || 'recent'
  switch (sortType) {
    case 'name':
      notes.sort((a, b) => a.title.localeCompare(b.title))
      break
    case 'cards':
      notes.sort((a, b) => (flashcardCounts[b.id] || 0) - (flashcardCounts[a.id] || 0))
      break
    case 'recent':
    default:
      notes.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  }

  // Totais
  const totalNotes = notes.length
  const totalFlashcards = Object.values(flashcardCounts).reduce((acc, val) => acc + val, 0)

  const handleCreateNote = async () => {
    'use server'
    const noteId = await createNote(workspaceId)
    redirect(`/dashboard/${workspaceId}/note/${noteId}`)
  }

  // Verifica se há filtro ativo
  const hasActiveFilter = searchParamsObj.search || searchParamsObj.sort !== 'recent'

  return (
    <div className="page-container animate-in fade-in duration-300 px-4 sm:px-6 py-4 sm:py-6">
      {/* Cabeçalho com informações do workspace */}
      <header className="flex flex-col md:flex-row md:items-start justify-between mb-6 gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="page-title text-2xl sm:text-3xl truncate">{workspace.name}</h1>
            {workspace.is_archived && (
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-surface-muted text-text-muted px-2.5 py-0.5 rounded-full border border-border">
                <Archive className="size-3" />
                Arquivado
              </span>
            )}
            {workspace.is_sprint_mode && (
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-warning-soft/50 text-warning px-2.5 py-0.5 rounded-full border border-warning/30">
                <Sparkles className="size-3" />
                Sprint
              </span>
            )}
          </div>
          {workspace.description && (
            <p className="page-subtitle mt-1 text-sm text-text-muted">{workspace.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-sm text-text-muted">
            <span className="flex items-center gap-1">
              <FileText className="size-4" />
              {totalNotes} nota{totalNotes !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1">
              <Layers className="size-4" />
              {totalFlashcards} flashcard{totalFlashcards !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="size-4" />
              {new Date(workspace.created_at).toLocaleDateString('pt-BR')}
            </span>
          </div>
        </div>

        <form action={handleCreateNote} className="shrink-0 w-full md:w-auto">
          <button type="submit" className="btn-primary w-full md:w-auto justify-center">
            <FilePlus className="size-5" />
            Nova Anotação
          </button>
        </form>
      </header>

      {/* Sprint Control */}
      <div className="mb-6">
        <SprintControl
          workspaceId={workspace.id}
          isSprintMode={workspace.is_sprint_mode}
          sprintDate={workspace.sprint_date}
        />
      </div>

      {/* Filtros e Ordenação - mostrados apenas se houver notas */}
      {totalNotes > 0 && (
        <div className="mb-6">
          <WorkspaceFilterBar
            initialSearch={searchParamsObj.search || ''}
            initialSort={sortType}
          />
          {hasActiveFilter && (
            <p className="text-xs text-text-muted mt-2 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Filtro ativo — {notes.length} resultado{notes.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}

      {/* Conteúdo principal - Grid de Notas por Tópicos */}
      {totalNotes === 0 ? (
        <div className="panel-muted flex flex-col items-center justify-center gap-3 py-20 text-center rounded-2xl">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <FileText className="size-7" />
          </span>
          <div>
            <p className="text-base font-medium text-text-strong">
              {searchParamsObj.search ? 'Nenhuma nota encontrada' : 'Este workspace está vazio'}
            </p>
            <p className="mt-1 text-sm text-text-muted max-w-sm">
              {searchParamsObj.search
                ? `Tente outros termos ou limpe o filtro.`
                : 'Crie sua primeira anotação para começar a organizar seu conhecimento.'}
            </p>
          </div>
        </div>
      ) : (
        <WorkspaceNotesGrid 
          initialNotes={notes} 
          flashcardCounts={flashcardCounts} 
          workspaceId={workspaceId} 
        />
      )}
    </div>
  )
}