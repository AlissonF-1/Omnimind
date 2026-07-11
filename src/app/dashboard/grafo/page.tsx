import { getWorkspaces } from '@/actions/workspaces'
import KnowledgeGraph from '@/components/KnowledgeGraph'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export const metadata = {
  title: 'Rede de Conexões — OmniMind',
  description: 'Visualize a similaridade vetorial das suas notas em um mapa mental interativo.',
}

export default async function GrafoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  const workspaces = await getWorkspaces()

  return (
    <div className="h-full flex flex-col">
      <KnowledgeGraph workspaces={workspaces} />
    </div>
  )
}
