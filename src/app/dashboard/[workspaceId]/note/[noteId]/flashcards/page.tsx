import FlashcardsManager from '@/components/FlashcardsManager'
import { getFlashcardsByNote } from '@/actions/flashcards'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function FlashcardsPage({ params }: { params: Promise<{ workspaceId: string; noteId: string }> }) {
  const resolved = await params
  const noteId = resolved.noteId
  const workspaceId = resolved.workspaceId

  const result = await getFlashcardsByNote(noteId)
  const initialCards = result?.cards ?? []

  return (
    <div className="page-container animate-in fade-in duration-200">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/${workspaceId}/note/${noteId}`} className="btn-ghost">
            <ArrowLeft className="size-4" />
            Voltar
          </Link>
          <h1 className="text-lg font-semibold">Gerenciar Flashcards</h1>
        </div>
      </div>

      <div className="max-w-4xl">
        {/* FlashcardsManager é component cliente */}
        {/* @ts-ignore Server -> Client prop passing */}
        <FlashcardsManager initialCards={initialCards} noteId={noteId} />
      </div>
    </div>
  )
}
