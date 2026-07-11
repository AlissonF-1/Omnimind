'use client'

import { useState, useEffect } from 'react'
import { updateNoteTitle } from '@/actions/notes'
import { Edit3 } from 'lucide-react'

interface EditableNoteTitleProps {
  noteId: string
  initialTitle: string
}

export default function EditableNoteTitle({ noteId, initialTitle }: EditableNoteTitleProps) {
  const [title, setTitle] = useState(initialTitle)
  const [isSaving, setIsSaving] = useState(false)

  // Auto-save com debounce
  useEffect(() => {
    // Evita salvar no primeiro render ou se não houver mudança
    if (title === initialTitle) return

    const timer = setTimeout(async () => {
      setIsSaving(true)
      try {
        await updateNoteTitle(noteId, title)
      } catch (error) {
        console.error('Erro ao atualizar título:', error)
      } finally {
        setIsSaving(false)
      }
    }, 1000) // Salva 1 segundo após o usuário parar de digitar

    return () => clearTimeout(timer)
  }, [title, initialTitle, noteId])

  return (
    <div className="relative flex-1 min-w-0 flex items-center group">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título da anotação..."
        className="text-base sm:text-lg font-semibold text-text-strong bg-transparent outline-none w-full truncate border-b border-transparent hover:border-border focus:border-primary/50 transition-colors py-0.5 pr-16"
        title={title}
      />
      
      {/* Indicador visual de salvamento e edição */}
      <div className="absolute right-0 flex items-center gap-2 pointer-events-none">
        {isSaving ? (
          <span className="text-[10px] font-medium text-text-muted animate-pulse">
            Salvando...
          </span>
        ) : (
          <Edit3 className="size-3.5 text-text-muted opacity-0 group-hover:opacity-50 transition-opacity" />
        )}
      </div>
    </div>
  )
}