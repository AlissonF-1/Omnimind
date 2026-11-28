'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { academyVocabularyNotes, exportAcademyVocabulary } from '@/actions/academy'
import type { LessonRef } from '@/lib/academy/contracts'

export function VocabularyExport({ lesson }: { lesson: LessonRef }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof academyVocabularyNotes>> | null>(null)
  const [reading, setReading] = useState(false)
  const [feedback, send, saving] = useActionState(async (_: string, form: FormData) => {
    try {
      const outcome = await exportAcademyVocabulary(lesson, String(form.get('note') ?? ''))
      if ('error' in outcome) return outcome.error ?? 'Falha ao salvar.'
      return outcome.count ? `${outcome.count} flashcards adicionados à revisão ativa.` : 'Os flashcards desta aula já estão na nota.'
    } catch { return 'Sem conexão para salvar os flashcards.' }
  }, '')
  async function loadNotes() {
    setReading(true)
    try { setResult(await academyVocabularyNotes()) }
    catch { setResult({ error: 'Sem conexão para carregar notas.' }) }
    finally { setReading(false) }
  }
  return <div className="ac-vocab-export">
    {result?.notes?.length ? <form action={send} className="ac-actions">
      <label htmlFor="ac-vocab-note">Escolha uma nota</label>
      <select id="ac-vocab-note" name="note" required defaultValue=""><option value="" disabled>Minhas notas</option>
        {result.notes.map((note) => <option key={note.id} value={note.id}>{note.title}</option>)}</select>
      <button className="ac-btn" disabled={saving}>{saving ? 'Salvando…' : 'Adicionar à revisão ativa'}</button>
    </form> : <>
      <button type="button" className="ac-btn" disabled={reading} onClick={loadNotes}>{reading ? 'Carregando…' : 'Revisar vocabulário com flashcards'}</button>
      {result?.notes?.length === 0 && <p>Crie uma nota em um workspace para guardar os flashcards. <Link href="/dashboard">Abrir dashboard</Link></p>}
    </>}
    {(result?.error || feedback) && <p role="status">{result?.error ?? feedback}</p>}
  </div>
}
