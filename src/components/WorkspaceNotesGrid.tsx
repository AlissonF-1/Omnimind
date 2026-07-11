'use client'

import { useState, useEffect, createContext, useContext } from 'react'
import Link from 'next/link'
import { Layers, MoreVertical, Edit2, Trash2, FolderInput, Check, X, AlertTriangle, GripVertical } from 'lucide-react'
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
  DragEndEvent,
  DragStartEvent
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
      className="p-1 text-text-muted hover:text-text-strong hover:bg-surface-muted rounded-md touch-none cursor-grab active:cursor-grabbing transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100 pointer-events-auto shrink-0 mr-1"
      aria-label="Arrastar nota"
    >
      <GripVertical className="size-4" />
    </button>
  )
}

// ==========================================
// SUB-COMPONENTES PARA DRAG AND DROP
// ==========================================

function DroppableTopic({ topic, children }: { topic: string; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: topic })
  return (
    <section
      ref={setNodeRef}
      className={`animate-in fade-in duration-300 rounded-2xl transition-all ${
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

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.3 : 1, // Fica transparente no grid enquanto a cópia (Overlay) segue o mouse
  } : undefined

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className="relative" // O touch-none e grab agora ficam apenas na alça (DragHandle)
    >
      <DragHandleContext.Provider value={{ attributes, listeners }}>
        {children}
      </DragHandleContext.Provider>
    </div>
  )
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export default function WorkspaceNotesGrid({ initialNotes, flashcardCounts, workspaceId }: WorkspaceNotesGridProps) {
  const [notes, setNotes] = useState(initialNotes)
  const [activeDragNote, setActiveDragNote] = useState<Note | null>(null)
  
  // Estados de Interatividade
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [topicChangingId, setTopicChangingId] = useState<string | null>(null)
  const [newTopic, setNewTopic] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  
  // Sincroniza o estado local sempre que o servidor mandar novos dados filtrados/ordenados
  useEffect(() => {
    setNotes(initialNotes)
  }, [initialNotes])

  // Sensores otimizados: como temos um Drag Handle dedicado, o toque no resto do card rola a página instantaneamente.
  // A ativação no Grip pode ser rápida e responsiva.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 50, // 50ms no Grip dedicado é instantâneo e natural para o usuário
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

  // ==========================================
  // HANDLERS DE AÇÕES INLINE
  // ==========================================

  const handleRename = async (noteId: string) => {
    if (!editTitle.trim()) return
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, title: editTitle } : n))
    setEditingId(null)
    setOpenMenuId(null)
    try { await updateNoteTitle(noteId, editTitle) } catch (e) { console.error(e) }
  }

  const handleChangeTopic = async (noteId: string) => {
    const topicToSave = newTopic.trim() || 'Geral'
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, topic: topicToSave } : n))
    setTopicChangingId(null)
    setOpenMenuId(null)
    try { await updateNoteTopic(noteId, topicToSave) } catch (e) { console.error(e) }
  }

  const handleDelete = async (noteId: string) => {
    setNotes(prev => prev.filter(n => n.id !== noteId))
    setConfirmDeleteId(null)
    try { await deleteNote(noteId) } catch (e) { console.error(e) }
  }

  // ==========================================
  // HANDLERS DO DRAG AND DROP
  // ==========================================

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    setActiveDragNote(active.data.current?.note as Note)
    // Fecha qualquer menu aberto ao começar a arrastar
    setOpenMenuId(null)
    setEditingId(null)
    setTopicChangingId(null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragNote(null)
    const { active, over } = event

    if (!over) return // Soltou o card num lugar inválido
    
    const noteId = String(active.id)
    const newTopic = String(over.id) // O ID da zona de soltura é o nome do tópico
    const oldTopic = active.data.current?.note?.topic || 'Geral'

    if (newTopic === oldTopic) return // Soltou dentro do mesmo tópico, não faz nada

    // Atualização otimista imediata na UI
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, topic: newTopic } : n))

    try {
      await updateNoteTopic(noteId, newTopic)
    } catch (error) {
      console.error('Erro ao mover via Drag and Drop', error)
      // Se falhar, reverte a nota pro tópico original (Rollback)
      setNotes(prev => prev.map(n => n.id === noteId ? { ...n, topic: oldTopic } : n))
    }
  }

  return (
    <DndContext id="workspace-notes-dnd" sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
              {topicNotes.map(note => {
                const cardCount = flashcardCounts[note.id] || 0
                const isEditing = editingId === note.id
                const isChangingTopic = topicChangingId === note.id
                const isDeleting = confirmDeleteId === note.id
                const isMenuOpen = openMenuId === note.id

                return (
                  <DraggableCard key={note.id} note={note}>
                    <div className="relative group panel hover:border-primary/50 transition-all flex flex-col justify-between h-[140px] bg-surface">
                      
                      {/* Link corrigido: bloqueia navegação se estiver arrastando */}
                      <Link 
                        href={`/dashboard/${workspaceId}/note/${note.id}`}
                        onClick={(e) => {
                          // Se o usuário estiver arrastando, cancela o clique de navegação
                          if (activeDragNote) e.preventDefault();
                        }}
                        className="absolute inset-0 z-0 rounded-xl"
                        aria-label={`Abrir nota ${note.title}`}
                      />

                      <div className="p-4 z-10 relative pointer-events-none">
                        <div className="flex items-start justify-between gap-2 pointer-events-auto">
                          {isEditing ? (
                            <div className="flex items-center gap-2 w-full">
                              <input 
                                autoFocus
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleRename(note.id)}
                                className="field w-full text-sm font-semibold h-8 py-1"
                              />
                              <button onClick={() => handleRename(note.id)} className="p-1.5 text-success hover:bg-success-soft rounded-md"><Check className="size-4" /></button>
                              <button onClick={() => setEditingId(null)} className="p-1.5 text-text-muted hover:bg-surface-muted rounded-md"><X className="size-4" /></button>
                            </div>
                          ) : isChangingTopic ? (
                            <div className="flex items-center gap-2 w-full">
                              <input 
                                autoFocus
                                placeholder="Criar nova pasta..."
                                value={newTopic}
                                onChange={(e) => setNewTopic(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleChangeTopic(note.id)}
                                className="field w-full text-sm h-8 py-1"
                              />
                              <button onClick={() => handleChangeTopic(note.id)} className="p-1.5 text-primary hover:bg-primary-soft rounded-md"><Check className="size-4" /></button>
                              <button onClick={() => setTopicChangingId(null)} className="p-1.5 text-text-muted hover:bg-surface-muted rounded-md"><X className="size-4" /></button>
                            </div>
                          ) : (
                            <div className="flex items-start gap-1 w-full pr-6">
                              {/* Alça de arrastar dedicada (Drag Handle) */}
                              <DragHandle />
                              
                              <h3 className="text-base font-semibold text-text-strong group-hover:text-primary transition-colors line-clamp-2">
                                {note.title}
                              </h3>
                            </div>
                          )}

                          {/* 3 PONTINHOS: Sempre visíveis no mobile, hover no desktop + z-20 */}
                          {!isEditing && !isChangingTopic && !isDeleting && (
                            <button 
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenMenuId(isMenuOpen ? null : note.id); }}
                              className="absolute top-3 right-3 p-1.5 text-text-muted hover:text-text-strong hover:bg-surface-muted rounded-md transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100 z-20"
                            >
                              <MoreVertical className="size-4" />
                            </button>
                          )}
                        </div>

                        {!isEditing && !isChangingTopic && (
                          <div className="flex items-center gap-3 mt-2 text-sm text-text-muted">
                            <span className="flex items-center gap-1">
                              <Layers className="size-3.5" />
                              {cardCount} card{cardCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="px-4 pb-4 z-10 relative pointer-events-none">
                        {isDeleting ? (
                          <div className="flex items-center justify-between gap-2 p-2 bg-error-soft border border-error/20 rounded-lg pointer-events-auto">
                            <div className="flex items-center gap-1.5 text-error">
                              <AlertTriangle className="size-4" />
                              <span className="text-xs font-semibold">Excluir?</span>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={(e) => { e.preventDefault(); setConfirmDeleteId(null); }} className="text-xs text-text-muted hover:text-text-strong">Cancelar</button>
                              <button onClick={(e) => { e.preventDefault(); handleDelete(note.id); }} className="text-xs font-bold text-error hover:underline">Sim</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between text-xs text-text-muted pt-2 border-t border-border/50">
                            <span>{new Date(note.updated_at).toLocaleDateString('pt-BR')}</span>
                            <span className="text-primary opacity-0 group-hover:opacity-100 transition-opacity">Abrir →</span>
                          </div>
                        )}
                      </div>

                      {/* Dropdown Aberto (Acima do card) */}
                      {isMenuOpen && (
                        <div className="absolute top-10 right-3 z-50 w-40 py-1 bg-surface-elevated border border-border shadow-lg rounded-xl pointer-events-auto">
                          <button onClick={(e) => { e.preventDefault(); setEditingId(note.id); setEditTitle(note.title); setOpenMenuId(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-strong hover:bg-surface-hover">
                            <Edit2 className="size-3.5" /> Renomear
                          </button>
                          <button onClick={(e) => { e.preventDefault(); setTopicChangingId(note.id); setNewTopic(note.topic || ''); setOpenMenuId(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-strong hover:bg-surface-hover">
                            <FolderInput className="size-3.5" /> Mover Tópico
                          </button>
                          <div className="h-px bg-border my-1" />
                          <button onClick={(e) => { e.preventDefault(); setConfirmDeleteId(note.id); setOpenMenuId(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error hover:bg-error-soft">
                            <Trash2 className="size-3.5" /> Excluir Nota
                          </button>
                        </div>
                      )}
                      
                    </div>
                  </DraggableCard>
                )
              })}
            </div>
          </DroppableTopic>
        ))}
      </div>

      {/* Overlay: Renderiza uma "cópia fantasma" do card grudada no mouse/dedo enquanto arrasta */}
      <DragOverlay>
        {activeDragNote ? (
          <div className="panel p-4 h-[140px] border-primary shadow-2xl flex flex-col justify-between bg-surface cursor-grabbing rotate-3 opacity-90">
            <div>
              <h3 className="text-base font-semibold text-text-strong line-clamp-2 pr-6">{activeDragNote.title}</h3>
              <div className="flex items-center gap-3 mt-2 text-sm text-text-muted">
                <Layers className="size-3.5" />
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