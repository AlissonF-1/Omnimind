'use client'

import { useState, useEffect, useRef, useCallback, memo, createContext, useContext } from 'react'
import Link from 'next/link'
import {
  Layers,
  MoreVertical,
  Edit2,
  Trash2,
  FolderInput,
  Check,
  X,
  AlertTriangle,
  GripVertical,
  Loader2
} from 'lucide-react'
import { updateNoteTitle, updateNoteTopic, deleteNote } from '@/actions/notes'
import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  DragOverlay,
  useDraggable,
  useDroppable,
  closestCorners,
  DragEndEvent
} from '@dnd-kit/core'

interface Note {
  id: string
  title: string
  topic?: string | null
  updated_at: string
}

interface WorkspaceNotesGridProps {
  initialNotes: Note[]
  flashcardCounts: Record<string, number>
  workspaceId: string
}

// Contexto para passar as propriedades de arrasto para o botão de Grip
const DragHandleContext = createContext<{
  attributes: any
  listeners: any
} | null>(null)

// Componente do botão de arrasto dedicado (Drag Handle)
function DragHandle() {
  const context = useContext(DragHandleContext)
  if (!context) return null
  const { attributes, listeners } = context

  return (
    <button
      type="button"
      {...attributes}
      {...listeners}
      className="p-1 text-text-muted hover:text-text-strong hover:bg-surface-muted rounded-md touch-none cursor-grab active:cursor-grabbing transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100 pointer-events-auto shrink-0 mr-1 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
      aria-label="Arrastar nota para mover de tópico"
    >
      <GripVertical className="size-4" />
    </button>
  )
}

// Sub-componentes DnD
function DroppableTopic({ topic, children }: { topic: string; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: topic })
  return (
    <section
      ref={setNodeRef}
      className={`rounded-2xl transition-all ${
        isOver ? 'bg-primary/5 ring-2 ring-primary/20 p-3 -mx-3 border border-dashed border-primary/30' : ''
      }`}
    >
      {children}
    </section>
  )
}

function DraggableCard({ note, children }: { note: Note; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: note.id,
    data: { note }
  })

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 50 : 'auto',
        opacity: isDragging ? 0.3 : 1,
      }
    : undefined

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <DragHandleContext.Provider value={{ attributes, listeners }}>
        {children}
      </DragHandleContext.Provider>
    </div>
  )
}

// ==========================================
// COMPONENTE DO CARD MEMOIZADO (React.memo)
// Isolamento de estado, acessibilidade e flexibilidade
// ==========================================
interface NoteCardItemProps {
  note: Note
  workspaceId: string
  cardCount: number
  isDragging: boolean
  onRename: (noteId: string, newTitle: string) => Promise<boolean>
  onChangeTopic: (noteId: string, newTopic: string) => Promise<boolean>
  onDelete: (noteId: string) => Promise<boolean>
}

const NoteCardItem = memo(function NoteCardItem({
  note,
  workspaceId,
  cardCount,
  isDragging,
  onRename,
  onChangeTopic,
  onDelete
}: NoteCardItemProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(note.title)
  const [isChangingTopic, setIsChangingTopic] = useState(false)
  const [newTopic, setNewTopic] = useState(note.topic || '')
  const [isDeleting, setIsDeleting] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  // Acessibilidade: Fechar menu ao pressionar 'Esc' ou clicar fora
  useEffect(() => {
    if (!isMenuOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        !menuButtonRef.current?.contains(e.target as Node)
      ) {
        setIsMenuOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isMenuOpen])

  const handleSaveRename = async () => {
    if (!editTitle.trim() || editTitle === note.title) {
      setIsEditing(false)
      return
    }

    setIsLoading(true)
    const success = await onRename(note.id, editTitle.trim())
    setIsLoading(false)
    if (success) {
      setIsEditing(false)
    } else {
      setEditTitle(note.title) // Rollback
    }
  }

  const handleSaveTopic = async () => {
    setIsLoading(true)
    const success = await onChangeTopic(note.id, newTopic.trim())
    setIsLoading(false)
    if (success) {
      setIsChangingTopic(false)
    } else {
      setNewTopic(note.topic || '') // Rollback
    }
  }

  const handleConfirmDelete = async () => {
    setIsLoading(true)
    const success = await onDelete(note.id)
    setIsLoading(false)
    if (!success) {
      setIsDeleting(false)
    }
  }

  return (
    <DraggableCard note={note}>
      <div
        className={`relative group panel hover:border-primary/50 transition-all flex flex-col justify-between min-h-[140px] h-full bg-surface shadow-sm rounded-xl p-4 ${
          isDragging ? 'border-primary' : ''
        }`}
      >
        {/* Topo do Card: Título / Inputs de Edição / 3 Pontinhos */}
        <div className="flex items-start justify-between gap-2 w-full">
          {isEditing ? (
            <div className="flex items-center gap-2 w-full z-10">
              <input
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveRename()}
                disabled={isLoading}
                className="field w-full text-sm font-semibold h-8 py-1"
                aria-label="Novo título da nota"
              />
              <button
                type="button"
                onClick={handleSaveRename}
                disabled={isLoading}
                className="p-1.5 text-success hover:bg-success-soft rounded-md shrink-0 disabled:opacity-50"
                aria-label="Confirmar renomeação"
              >
                {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                disabled={isLoading}
                className="p-1.5 text-text-muted hover:bg-surface-muted rounded-md shrink-0"
                aria-label="Cancelar edição"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : isChangingTopic ? (
            <div className="flex items-center gap-2 w-full z-10">
              <input
                autoFocus
                placeholder="Nome da pasta/tópico..."
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveTopic()}
                disabled={isLoading}
                className="field w-full text-sm h-8 py-1"
                aria-label="Nome do novo tópico"
              />
              <button
                type="button"
                onClick={handleSaveTopic}
                disabled={isLoading}
                className="p-1.5 text-primary hover:bg-primary-soft rounded-md shrink-0 disabled:opacity-50"
                aria-label="Confirmar novo tópico"
              >
                {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              </button>
              <button
                type="button"
                onClick={() => setIsChangingTopic(false)}
                disabled={isLoading}
                className="p-1.5 text-text-muted hover:bg-surface-muted rounded-md shrink-0"
                aria-label="Cancelar mudança de tópico"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-start gap-1 w-full pr-7">
              {/* Alça de Arraste Dedicada */}
              <DragHandle />

              {/* Título Acessível com Link Direto */}
              <Link
                href={`/dashboard/${workspaceId}/note/${note.id}`}
                className="text-base font-semibold text-text-strong group-hover:text-primary transition-colors line-clamp-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
                aria-label={`Nota: ${note.title}`}
              >
                {note.title}
              </Link>
            </div>
          )}

          {/* Botão de Menu 3 Pontinhos com ARIA e estado isolado */}
          {!isEditing && !isChangingTopic && !isDeleting && (
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-expanded={isMenuOpen}
              aria-haspopup="true"
              aria-label={`Opções da nota ${note.title}`}
              className="absolute top-3 right-3 p-1.5 text-text-muted hover:text-text-strong hover:bg-surface-muted rounded-md transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 z-20"
            >
              <MoreVertical className="size-4" />
            </button>
          )}
        </div>

        {/* Quantidade de Flashcards */}
        {!isEditing && !isChangingTopic && !isDeleting && (
          <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <Layers className="size-3.5 text-primary" />
              {cardCount} card{cardCount !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Rodapé: Data e Ação de Exclusão */}
        <div className="pt-3 mt-3 border-t border-border/50">
          {isDeleting ? (
            <div className="flex items-center justify-between gap-2 p-2 bg-error-soft border border-error/20 rounded-lg">
              <div className="flex items-center gap-1.5 text-error">
                {isLoading ? <Loader2 className="size-4 animate-spin" /> : <AlertTriangle className="size-4" />}
                <span className="text-xs font-semibold">Excluir?</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsDeleting(false)}
                  disabled={isLoading}
                  className="text-xs text-text-muted hover:text-text-strong focus-visible:outline-none"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isLoading}
                  className="text-xs font-bold text-error hover:underline focus-visible:outline-none"
                >
                  Sim, excluir
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>{new Date(note.updated_at).toLocaleDateString('pt-BR')}</span>
              <Link
                href={`/dashboard/${workspaceId}/note/${note.id}`}
                className="text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
              >
                Abrir →
              </Link>
            </div>
          )}
        </div>

        {/* Dropdown de Opções (Com Acessibilidade Esc e Click-Outside) */}
        {isMenuOpen && (
          <div
            ref={menuRef}
            role="menu"
            className="absolute top-10 right-3 z-50 w-44 py-1.5 bg-surface-elevated border border-border shadow-xl rounded-xl animate-in fade-in duration-150"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsEditing(true)
                setEditTitle(note.title)
                setIsMenuOpen(false)
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-strong hover:bg-surface-hover text-left transition-colors"
            >
              <Edit2 className="size-3.5 text-primary" /> Renomear
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsChangingTopic(true)
                setNewTopic(note.topic || '')
                setIsMenuOpen(false)
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-strong hover:bg-surface-hover text-left transition-colors"
            >
              <FolderInput className="size-3.5 text-primary" /> Mover Tópico
            </button>
            <div className="h-px bg-border/60 my-1" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsDeleting(true)
                setIsMenuOpen(false)
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-error hover:bg-error-soft text-left transition-colors"
            >
              <Trash2 className="size-3.5" /> Excluir Nota
            </button>
          </div>
        )}
      </div>
    </DraggableCard>
  )
})

// ==========================================
// COMPONENTE PRINCIPAL (WorkspaceNotesGrid)
// ==========================================

export default function WorkspaceNotesGrid({ initialNotes, flashcardCounts, workspaceId }: WorkspaceNotesGridProps) {
  const [notes, setNotes] = useState(initialNotes)
  const [activeDragNote, setActiveDragNote] = useState<Note | null>(null)

  // Manter estado sincronizado se as propriedades iniciais mudarem (ex: novo filtro)
  useEffect(() => {
    setNotes(initialNotes)
  }, [initialNotes])

  // Sensores DnD com sensibilidade apurada para o DragHandle
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 50,
        tolerance: 5,
      },
    })
  )

  const groupedNotes = notes.reduce((acc, note) => {
    const topicName = note.topic || 'Geral'
    if (!acc[topicName]) acc[topicName] = []
    acc[topicName].push(note)
    return acc
  }, {} as Record<string, Note[]>)

  const handleRenameNote = useCallback(async (noteId: string, newTitle: string): Promise<boolean> => {
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, title: newTitle } : n)))
    try {
      await updateNoteTitle(noteId, newTitle)
      return true
    } catch (e) {
      console.error('Erro ao renomear nota:', e)
      return false
    }
  }, [])

  const handleChangeTopicNote = useCallback(async (noteId: string, newTopic: string): Promise<boolean> => {
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, topic: newTopic } : n)))
    try {
      await updateNoteTopic(noteId, newTopic)
      return true
    } catch (e) {
      console.error('Erro ao alterar tópico:', e)
      return false
    }
  }, [])

  const handleDeleteNote = useCallback(async (noteId: string): Promise<boolean> => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId))
    try {
      await deleteNote(noteId)
      return true
    } catch (e) {
      console.error('Erro ao deletar nota:', e)
      return false
    }
  }, [])

  const handleDragStart = (event: any) => {
    const note = notes.find((n) => n.id === String(event.active.id))
    if (note) setActiveDragNote(note)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragNote(null)
    const { active, over } = event

    if (!over) return

    const noteId = String(active.id)
    const newTopic = String(over.id)
    const oldTopic = active.data.current?.note?.topic || 'Geral'

    if (newTopic === oldTopic) return

    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, topic: newTopic } : n)))

    try {
      await updateNoteTopic(noteId, newTopic)
    } catch (error) {
      console.error('Erro ao mover via Drag and Drop', error)
      setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, topic: oldTopic } : n)))
    }
  }

  return (
    <DndContext
      id="workspace-notes-dnd"
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-10">
        {Object.entries(groupedNotes).map(([topic, topicNotes]) => (
          <DroppableTopic key={topic} topic={topic}>
            <div className="flex items-center gap-3 mb-4 border-b border-border pb-2">
              <h2 className="text-xl font-bold text-text-strong">{topic}</h2>
              <span className="text-xs font-medium text-text-muted bg-surface-muted px-2 py-1 rounded-full">
                {topicNotes.length} {topicNotes.length === 1 ? 'nota' : 'notas'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {topicNotes.map((note) => (
                <NoteCardItem
                  key={note.id}
                  note={note}
                  workspaceId={workspaceId}
                  cardCount={flashcardCounts[note.id] || 0}
                  isDragging={activeDragNote?.id === note.id}
                  onRename={handleRenameNote}
                  onChangeTopic={handleChangeTopicNote}
                  onDelete={handleDeleteNote}
                />
              ))}
            </div>
          </DroppableTopic>
        ))}
      </div>

      <DragOverlay>
        {activeDragNote ? (
          <div className="panel p-4 min-h-[140px] border-primary shadow-2xl flex flex-col justify-between bg-surface cursor-grabbing rotate-3 opacity-90 rounded-xl">
            <div>
              <h3 className="text-base font-semibold text-text-strong line-clamp-2 pr-6">{activeDragNote.title}</h3>
              <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
                <Layers className="size-3.5 text-primary" />
                {flashcardCounts[activeDragNote.id] || 0} cards
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-text-muted pt-2 border-t border-border/50">
              <span>{new Date(activeDragNote.updated_at).toLocaleDateString('pt-BR')}</span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}