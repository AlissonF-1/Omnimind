import { redirect } from 'next/navigation'
import ChatPanel from '@/components/ChatPanel'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Conversar com a IA · OmniMind' }

export default async function AssistantPage() {
  const db = await createClient()
  const { data: { user }, error } = await db.auth.getUser()
  if (error || !user) redirect('/login')

  const { data: workspaces } = await db.from('workspaces').select('id,name').eq('user_id', user.id).order('name')
    .overrideTypes<{ id: string; name: string }[], { merge: false }>()
  return <div className="oa-page"><ChatPanel key={user.id} accountId={user.id} workspaces={workspaces ?? []} /></div>
}
