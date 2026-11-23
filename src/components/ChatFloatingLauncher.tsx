'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, usePathname } from 'next/navigation'
import Image from 'next/image'
import ChatPanel from '@/components/ChatPanel'
import { assistantPath } from '@/lib/assistant/contracts'

export default function ChatFloatingLauncher({ accountId, workspaces }: {
  accountId: string | null
  workspaces: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const workspace = useParams().workspaceId
  const pathname = usePathname()
  const canOpen = !!accountId && pathname !== assistantPath

  useEffect(() => {
    if (!canOpen) return
    const handleOpen = () => setOpen(true)
    window.addEventListener('open-chat', handleOpen)
    return () => window.removeEventListener('open-chat', handleOpen)
  }, [canOpen])

  useEffect(() => {
    if (open && canOpen) dialog.current?.showModal()
    else dialog.current?.close()
  }, [open, canOpen])

  if (!accountId) return null
  return (
    <>
      {canOpen && <button type="button" onClick={() => setOpen(true)}
        className="os-assistant-launch focus-visible:ring-2 focus-visible:ring-violet-300" aria-label="Abrir Assistente" title="Assistente OmniMind"
      >
        <span className="os-assistant-launch-label" aria-hidden="true">Fale com a IA do OmniMind</span>
        <span className="os-assistant-avatar"><Image src="/images/dashboard/assistant.webp" alt="" width={52} height={52} /></span>
      </button>}
      <dialog ref={dialog} className="oa-overlay os-chat-overlay" aria-label="Assistente OmniMind" onClose={() => setOpen(false)}
        onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close() }}>
        {open && canOpen && <ChatPanel key={accountId + ':' + workspace} accountId={accountId} workspaces={workspaces}
          initialWorkspaceId={typeof workspace === 'string' ? workspace : undefined} onClose={() => dialog.current?.close()} />}
      </dialog>
    </>
  )
}
