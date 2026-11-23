'use client'

import Image from 'next/image'

export default function DashboardAssistantTeaser() {
  return (
    <button type="button" className="dh-assistant-teaser" aria-label="Abrir Assistente de estudos"
      onClick={() => window.dispatchEvent(new Event('open-chat'))}
    >
      <span>Seu assistente de estudos com IA, sempre com você.</span>
      <Image src="/images/dashboard/assistant.webp" width={58} height={58} alt="" />
    </button>
  )
}
