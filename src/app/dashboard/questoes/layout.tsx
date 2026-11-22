import type { ReactNode } from 'react'
import './questions.css'

export const dynamic = 'force-dynamic'

export default function QuestionsLayout({ children }: { children: ReactNode }) {
  return <div className="quest-module">{children}</div>
}
