import type { ReactNode } from 'react'
import { StudyFocus } from '@/components/academy/StudyFocus'
import './academy.css'
import './prototype.css'

export const metadata = { title: 'Academy · OmniMind' }
export const dynamic = 'force-dynamic'

export default function AcademyLayout({ children }: { children: ReactNode }) {
  return <div className="ac-shell"><StudyFocus>{children}</StudyFocus></div>
}
