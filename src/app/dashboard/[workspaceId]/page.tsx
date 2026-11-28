import Image from 'next/image'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Archive, CalendarDays, FilePlus, FileText, Folder, Layers, Search, Sparkles, Trophy } from '@/components/icons'
import { createNote, getNotes } from '@/actions/notes'
import { getWorkspaceById } from '@/actions/workspaces'
import { getWorkspaceFlashcardCounts } from '@/actions/stats'
import SprintControl from '@/components/SprintControl'
import WorkspaceFilterBar from '@/components/WorkspaceFilterBar'
import WorkspaceNotesGrid from '@/components/WorkspaceNotesGrid'
import './workspace.css'

export const dynamic = 'force-dynamic'

function NewNoteForm({ action }: { action: () => Promise<void> }) {
  return <form action={action} className="wp-create">
    <button type="submit" className="wp-button wp-primary"><FilePlus size={19} aria-hidden="true" /> Nova anotação</button>
  </form>
}

export default async function WorkspacePage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ sort?: string; search?: string }>
}) {
  const [{ workspaceId }, options] = await Promise.all([params, searchParams])
  const search = typeof options.search === 'string' ? options.search.trim() : ''
  const sort = options.sort === 'name' || options.sort === 'cards' ? options.sort : 'recent'
  const [workspace, listedNotes, flashcardCounts] = await Promise.all([
    getWorkspaceById(workspaceId),
    getNotes(workspaceId, { search, sort }),
    getWorkspaceFlashcardCounts(workspaceId),
  ])
  if (!workspace) notFound()

  const notes = sort === 'cards'
    ? [...listedNotes].sort((a, b) => (flashcardCounts[b.id] || 0) - (flashcardCounts[a.id] || 0))
    : listedNotes
  const totalNotes = search ? Math.max(notes.length, Object.keys(flashcardCounts).length) : notes.length
  const totalFlashcards = Object.values(flashcardCounts).reduce((sum, count) => sum + count, 0)
  const level = workspace.mastery_level || 1
  const mastered = level >= 10
  const experience = (workspace.mastery_xp || 0) % 100
  const date = new Date(workspace.created_at)
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const clearSearchHref = '/dashboard/' + encodeURIComponent(workspaceId) + (sort === 'recent' ? '' : '?sort=' + sort)

  async function handleCreateNote() {
    'use server'
    const noteId = await createNote(workspaceId)
    redirect(`/dashboard/${workspaceId}/note/${noteId}`)
  }

  return <div className="workspace-page">
    <header className="wp-header">
      <div className="wp-identity">
        <span className="wp-icon wp-folder"><Folder size={27} aria-hidden="true" /></span>
        <div className="wp-identity-copy">
          <div className="wp-title-line">
            <h1>{workspace.name}</h1>
            {workspace.is_archived && <span className="wp-pill"><Archive size={13} aria-hidden="true" /> Arquivado</span>}
            {workspace.is_sprint_mode && <span className="wp-pill wp-sprint-pill"><Sparkles size={13} aria-hidden="true" /> Sprint</span>}
          </div>
          {workspace.description && <p className="wp-description">{workspace.description}</p>}
          <ul className="wp-meta" aria-label="Informações do workspace">
            <li><FileText size={16} aria-hidden="true" />{totalNotes} {totalNotes === 1 ? 'nota' : 'notas'}</li>
            <li><Layers size={17} aria-hidden="true" />{totalFlashcards} {totalFlashcards === 1 ? 'flashcard' : 'flashcards'}</li>
            <li><CalendarDays size={16} aria-hidden="true" /><time dateTime={workspace.created_at}>{date.toLocaleDateString('pt-BR')}</time></li>
          </ul>
        </div>
      </div>
      <NewNoteForm action={handleCreateNote} />
    </header>

    <section className="wp-panel wp-mastery" aria-labelledby="wp-mastery-title">
      <div className="wp-mastery-art" aria-hidden="true">
        <Image src="/images/dashboard/brain.webp" alt="" fill sizes="(max-width: 600px) 40vw, 420px" />
      </div>
      <div className="wp-mastery-copy">
        <div className="wp-mastery-heading">
          <h2 id="wp-mastery-title"><Trophy size={21} aria-hidden="true" /> Domínio da matéria</h2>
          <span className="wp-pill wp-level">{mastered ? 'Nível 10/10 · Mestre' : `Nível ${level}/10`}</span>
        </div>
        <progress aria-label="XP para o próximo nível" value={mastered ? 100 : experience} max={100} />
        <div className="wp-mastery-meta">
          <span>{mastered ? 'XP máximo' : `${experience} / 100 XP`}</span>
          <span>{mastered ? 'Maestria conquistada' : `${100 - experience} XP para evoluir`}</span>
        </div>
      </div>
    </section>

    <SprintControl workspaceId={workspace.id} isSprintMode={workspace.is_sprint_mode} sprintDate={workspace.sprint_date} today={today} />

    {(totalNotes > 0 || search) && <section className="wp-notes-tools" aria-labelledby="wp-notes-title">
      <h2 id="wp-notes-title">Anotações</h2>
      <WorkspaceFilterBar initialSearch={search} initialSort={sort} />
      {search && <p role="status">{notes.length} {notes.length === 1 ? 'resultado encontrado' : 'resultados encontrados'}</p>}
    </section>}

    {notes.length > 0 ? (
      <WorkspaceNotesGrid initialNotes={notes} flashcardCounts={flashcardCounts} workspaceId={workspaceId} />
    ) : search ? (
      <section className="wp-panel wp-empty wp-empty-filter">
        <span className="wp-icon"><Search size={26} aria-hidden="true" /></span>
        <h2>Nenhuma nota encontrada</h2>
        <p>Tente buscar por outro título ou limpe a busca.</p>
        <Link href={clearSearchHref} className="wp-button">Limpar busca</Link>
      </section>
    ) : (
      <section className="wp-panel wp-empty wp-empty-illustrated">
        <div className="wp-empty-art" aria-hidden="true">
          <Image src="/images/dashboard/workspace-notes.webp" alt="" fill sizes="(max-width: 600px) 65vw, 380px" />
        </div>
        <h2>Este workspace está vazio</h2>
        <p>Crie sua primeira anotação para começar a organizar seu conhecimento.</p>
        <NewNoteForm action={handleCreateNote} />
      </section>
    )}
  </div>
}
