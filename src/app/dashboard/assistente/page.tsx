import { redirect } from 'next/navigation'
import ChatPanel from '@/components/ChatPanel'
import { learningTutorFromSearch } from '@/lib/assistant/learning-tutor'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Conversar com a IA · OmniMind' }

export default async function AssistantPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const db = await createClient()
  const { data: { user }, error } = await db.auth.getUser()
  if (error || !user) redirect('/login')

  const { data: workspaces } = await db.from('workspaces').select('id,name').eq('user_id', user.id).order('name')
    .overrideTypes<{ id: string; name: string }[], { merge: false }>()
  const search = await searchParams
  const learning = learningTutorFromSearch({ get: (key) => typeof search[key] === 'string' ? search[key] : null })
  return <div className="oa-page"><ChatPanel key={user.id} accountId={user.id} workspaces={workspaces ?? []} learning={learning ?? undefined} /></div>
}
