import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { indexNote } from '@/actions/embeddings'

export async function POST(req: Request) {
  try {
    const { workspaceId, title, content, doIndex } = await req.json()
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })

    const supabase = await createClient()

    // If client passed a bearer token, set it on the server client so RLS / auth.uid() works
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null
    if (token) {
      try {
        // @ts-ignore
        await supabase.auth.setAuth(token)
      } catch (e) {
        console.warn('supabase.auth.setAuth failed:', e)
      }
    }

    const authRes = await supabase.auth.getUser()
    const user = authRes.data?.user
    if (!user) {
      console.error('create-note: sem usuário autenticado (supabase.auth.getUser() retornou):', authRes)
      return NextResponse.json({ error: 'Não autenticado. Verifique se a requisição inclui cookies de sessão (use fetch(..., { credentials: "include" })).' }, { status: 401 })
    }

    const { data, error } = await supabase.from('notes').insert({
      user_id: user.id,
      workspace_id: workspaceId,
      title: title || 'Importado PDF',
      content: content || ''
    }).select('id').single()

    if (error) {
      console.error('Erro ao criar nota:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const noteId = data.id

    if (doIndex) {
      try {
        await indexNote(noteId, title || 'Importado PDF', content || '')
      } catch (e) {
        console.error('Falha ao indexar nota criada:', e)
      }
    }

    return NextResponse.json({ success: true, noteId })
  } catch (e: any) {
    console.error('create-note route error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
