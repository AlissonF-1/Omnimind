'use client'

import { usePathname } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { academyPath } from '@/lib/academy/contracts'

export function StudyFocus({ children }: { children: ReactNode }) {
  const [focused, setFocused] = useState(false)
  const path = usePathname()
  const section = path === academyPath ? 'Visão geral' : path.endsWith('/jornada') ? 'Minha jornada'
    : path.endsWith('/competencias') ? 'Competências' : 'Aula'
  return <div className="ac3-shell" data-focus={focused}>
    <header className="ac3-top">
      <span>Academy / {section}</span>
      <button className="ac3-ghost" type="button" aria-pressed={focused} onClick={() => setFocused(!focused)}>
        {focused ? 'Sair do foco' : 'Modo foco'}
      </button>
    </header>
    <div className="ac3-content">{children}</div>
  </div>
}
