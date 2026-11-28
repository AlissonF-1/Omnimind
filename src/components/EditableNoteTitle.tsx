'use client'

import { useState, useEffect } from 'react'
import { updateNoteTitle } from '@/actions/notes'
import { Edit3 } from '@/components/icons'

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
    <div className="nt-title-field">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Título da anotação"
        placeholder="Título da anotação"
        className="nt-title-input"
        title={title}
      />
      
      <div className="nt-title-indicator" role="status">
        {isSaving ? (
          <span>Salvando título…</span>
        ) : (
          <Edit3 size={16} aria-hidden="true" />
        )}
      </div>
    </div>
  )
}
