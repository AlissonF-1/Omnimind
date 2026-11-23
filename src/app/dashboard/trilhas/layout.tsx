import type { ReactNode } from 'react'
import '../questoes/questions.css'
import './learning.css'

export const dynamic = 'force-dynamic'

export default function LearningLayout({ children }: { children: ReactNode }) {
  return <div className="lp-module"><div className="lp-shell">{children}</div></div>
}
