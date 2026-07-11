import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { Brain } from 'lucide-react'

export default async function WorkspaceSelector() {
  const supabase = await createClient()
  
  // 1. Busca todos os workspaces ativos (ignorando arquivados de forma robusta)
  const { data: workspaces } = await supabase.from('workspaces').select('id, name, is_archived')
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !workspaces) return null

  const activeWorkspaces = (workspaces ?? []).filter((ws: any) => !ws.is_archived)

  // 2. Busca todos os flashcards do usuário com o workspace_id
  const { data: cards } = await supabase
    .from('flashcards')
    .select('id, due, state, notes!inner(workspace_id)')
    .eq('notes.user_id', user.id)

  // 3. Busca workspaces em Sprint ativa
  const { data: sprintWs } = await supabase
    .from('workspaces')
    .select('id')
    .eq('is_sprint_mode', true)
    .gte('sprint_date', new Date().toISOString())
    .eq('user_id', user.id)

  const sprintWsIds = new Set(sprintWs?.map(ws => ws.id) || [])
  const now = new Date().getTime()
  
  // Mapeia o contador de cards pendentes por workspace_id
  const dueCountsMap: Record<string, number> = {}

  if (cards) {
    for (const card of cards) {
      const noteData = card.notes as any
      const cardWorkspaceId = Array.isArray(noteData)
        ? noteData[0]?.workspace_id
        : noteData?.workspace_id

      if (!cardWorkspaceId) continue

      const isNew = !card.due || card.state === 0 || card.state === null
      const isDue = card.due ? new Date(card.due).getTime() <= now : false
      const isSprint = sprintWsIds.has(cardWorkspaceId)

      if (isNew || isDue || isSprint) {
        dueCountsMap[cardWorkspaceId] = (dueCountsMap[cardWorkspaceId] || 0) + 1
      }
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full mt-4">
      {activeWorkspaces.map((ws, index) => {
        const dueCount = dueCountsMap[ws.id] || 0
        return (
          <div 
            key={ws.id}
            className="animate-in fade-in zoom-in-95 duration-500"
            style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
          >
            <Link 
              href={`/dashboard/revisoes?workspaceId=${ws.id}`}
              className="group relative flex flex-col items-start gap-4 rounded-2xl border border-border/50 bg-surface/60 p-6 backdrop-blur-sm transition-all hover:border-primary/50 hover:bg-primary/[0.05] hover:shadow-lg hover:-translate-y-1 active:scale-95 duration-200 cursor-pointer text-left overflow-hidden h-full"
            >
              {/* Brilho de gradiente no fundo (hover) */}
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-primary/10 to-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

              <div className="flex items-center justify-between w-full z-10">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/25">
                  <Brain className="size-5" />
                </div>
                <span className="text-primary opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-200">→</span>
              </div>

              <div className="z-10 mt-2 w-full flex-1 flex flex-col justify-between">
                <span className="block font-semibold text-text-strong text-base break-words leading-tight">{ws.name}</span>
                
                <div className="mt-3">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-muted px-2.5 py-1 text-[11px] font-bold text-text-medium border border-border/30">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${dueCount > 0 ? 'animate-ping bg-amber-500' : 'bg-success'}`}></span>
                      <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${dueCount > 0 ? 'bg-amber-500' : 'bg-success'}`}></span>
                    </span>
                    {dueCount > 0 ? `${dueCount} pendente${dueCount !== 1 ? 's' : ''}` : 'tudo em dia'}
                  </span>
                </div>
              </div>
            </Link>
          </div>
        )
      })}
    </div>
  )
}