import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Usuário não autenticado. Faça login no OmniMind.' }, { status: 401 })
    }

    const { title, content, url, workspaceId } = await req.json()

    if (!content || !title) {
      return NextResponse.json({ error: 'Título ou conteúdo ausentes.' }, { status: 400 })
    }

    // Se o usuário enviou um workspaceId, usa ele. 
    // Se não enviou, mantém a lógica de fallback antiga (para não quebrar versões antigas)
    let finalWorkspaceId = workspaceId

    if (!finalWorkspaceId) {
      // Lógica de fallback (buscar "Web Clipper" ou criar um)
      const { data: existingWorkspace } = await supabase
        .from('workspaces')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', 'Web Clipper')
        .maybeSingle()

      if (existingWorkspace) {
        finalWorkspaceId = existingWorkspace.id
      } else {
        const { data: firstWorkspace } = await supabase
          .from('workspaces')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle()

        if (firstWorkspace) {
          finalWorkspaceId = firstWorkspace.id
        } else {
          const { data: newWorkspace, error: wsError } = await supabase
            .from('workspaces')
            .insert({ user_id: user.id, name: 'Clipper', description: 'Notas salvas da web' })
            .select('id')
            .single()

          if (wsError || !newWorkspace) throw new Error('Não foi possível criar um workspace para salvar a nota.')
          finalWorkspaceId = newWorkspace.id
        }
      }
    }

    // Cria a nota com o workspaceId escolhido
    const { data: note, error } = await supabase
      .from('notes')
      .insert({
        user_id: user.id,
        workspace_id: finalWorkspaceId,
        title: `📎 ${title}`,
        content: `**Fonte:** ${url}\n\n---\n\n${content}`,
        topic: 'Web Clipper'
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, noteId: note.id, workspaceId: finalWorkspaceId })

  } catch (error: any) {
    console.error('Erro no Clipper:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}