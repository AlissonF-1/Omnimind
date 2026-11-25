'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, usePathname, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import ChatPanel from '@/components/ChatPanel'
import { assistantPath } from '@/lib/assistant/contracts'
import {
  learningTutorFromSearch, learningTutorHistoryScope, parseLearningTutorContext, parseLearningTutorLabel,
  writeLearningTutorSearch, type LearningTutorLabel,
} from '@/lib/assistant/learning-tutor'

export default function ChatFloatingLauncher({ accountId, workspaces }: {
  accountId: string | null
  workspaces: { id: string; name: string }[]
}) {
  const [generalOpen, setGeneralOpen] = useState(false)
  const [initialLabel, setInitialLabel] = useState<{ scope: string; label?: LearningTutorLabel }>()
  const dialog = useRef<HTMLDialogElement>(null)
  const workspace = useParams().workspaceId
  const pathname = usePathname()
  const search = useSearchParams()
  const candidate = learningTutorFromSearch(search)
  const learning = pathname.startsWith('/dashboard/trilhas/') && candidate?.stepId === search.get('etapa') ? candidate : null
  const scope = learning ? learningTutorHistoryScope(learning) : ''
  const open = generalOpen || !!learning
  const canOpen = !!accountId && pathname !== assistantPath

  useEffect(() => {
    if (!canOpen) return
    const handleOpen = (event: Event) => {
      const detail: unknown = event instanceof CustomEvent ? event.detail : undefined
      const context = parseLearningTutorContext(detail)
      if (context && pathname.startsWith('/dashboard/trilhas/')) {
        const currentSearch = new URLSearchParams(window.location.search)
        if (currentSearch.get('etapa') !== context.stepId) return
        const label = detail && typeof detail === 'object' && 'label' in detail ? parseLearningTutorLabel(detail.label) : undefined
        setInitialLabel({ scope: learningTutorHistoryScope(context), label })
        setGeneralOpen(false)
        window.history.replaceState(null, '', pathname + '?' + writeLearningTutorSearch(currentSearch, context))
        return
      }
      if (!detail) setGeneralOpen(true)
    }
    window.addEventListener('open-chat', handleOpen)
    return () => window.removeEventListener('open-chat', handleOpen)
  }, [canOpen, pathname])

  useEffect(() => {
    if (open && canOpen) dialog.current?.showModal()
    else dialog.current?.close()
  }, [open, canOpen])

  if (!accountId) return null

  function close() {
    setGeneralOpen(false)
    if (!learning || window.location.pathname !== pathname) return
    const search = writeLearningTutorSearch(new URLSearchParams(window.location.search), null).toString()
    window.history.replaceState(null, '', pathname + (search ? '?' + search : ''))
  }

  return (
    <>
      {canOpen && <button type="button" onClick={() => setGeneralOpen(true)}
        className="os-assistant-launch focus-visible:ring-2 focus-visible:ring-violet-300" aria-label="Abrir Assistente" title="Assistente OmniMind"
      >
        <span className="os-assistant-launch-label" aria-hidden="true">Fale com a IA do OmniMind</span>
        <span className="os-assistant-avatar"><Image src="/images/dashboard/assistant.webp" alt="" width={52} height={52} /></span>
      </button>}
      <dialog ref={dialog} className="oa-overlay os-chat-overlay" aria-label="Assistente OmniMind" onClose={close}
        onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close() }}>
        {open && canOpen && <ChatPanel key={accountId + ':' + workspace + ':' + scope} accountId={accountId} workspaces={workspaces}
          learning={learning ?? undefined} initialLearningLabel={initialLabel?.scope === scope ? initialLabel.label : undefined}
          initialWorkspaceId={typeof workspace === 'string' ? workspace : undefined}
          onClose={() => dialog.current?.close()} />}
      </dialog>
    </>
  )
}
