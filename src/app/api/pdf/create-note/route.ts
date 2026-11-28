import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { indexNote } from '@/actions/embeddings'

const workspacePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request) {
  const db = await createClient()
  const { data: { user }, error: authError } = await db.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Entre na sua conta para criar a nota.' }, { status: 401 })

  const input: unknown = await req.json().catch(() => null)
  const { workspaceId, title, content, doIndex } = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  if (typeof workspaceId !== 'string' || workspaceId.length !== 36 || !workspacePattern.test(workspaceId) ||
    typeof title !== 'string' || typeof content !== 'string' || title.length > 200 || content.length > 100_000) {
    return NextResponse.json({ error: 'Workspace ou conteúdo da nota inválido.' }, { status: 400 })
  }

  const { data: workspace, error: workspaceError } = await db.from('workspaces')
    .select('id').eq('id', workspaceId).eq('user_id', user.id).maybeSingle()
  if (workspaceError) return NextResponse.json({ error: 'Não foi possível verificar o workspace.' }, { status: 503 })
  if (!workspace) return NextResponse.json({ error: 'Workspace indisponível.' }, { status: 404 })

  const noteTitle = title.trim() || 'Importado PDF'
  const { data, error } = await db.from('notes').insert({
    user_id: user.id, workspace_id: workspace.id, title: noteTitle, content,
  }).select('id').single()
  if (error || !data) return NextResponse.json({ error: 'Não foi possível criar a nota.' }, { status: 500 })

  if (doIndex === true) await indexNote(data.id, noteTitle, content).catch(() => undefined)
  return NextResponse.json({ success: true, noteId: data.id })
}
