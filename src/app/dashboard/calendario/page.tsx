import { CalendarDays } from 'lucide-react'
import { getCalendarData, getExamGoals } from '@/actions/calendar'
import { getWorkspaces } from '@/actions/workspaces'
import StudyCalendar from '@/components/StudyCalendar'

export const dynamic = 'force-dynamic'

export default async function CalendarioPage() {
  const today = new Date()
  const month = today.getMonth()
  const year = today.getFullYear()

  const [initialData, examGoals, workspaces] = await Promise.all([
    getCalendarData(month, year),
    getExamGoals(),
    getWorkspaces()
  ])

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <CalendarDays className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-black text-text-strong tracking-tight">
            Calendário de Estudos
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            Visualize sua carga FSRS e configure metas por data de prova
          </p>
        </div>
      </div>

      <StudyCalendar
        initialData={initialData}
        initialGoals={examGoals}
        currentMonth={month}
        currentYear={year}
        workspaces={workspaces || []}
      />
    </div>
  )
}
