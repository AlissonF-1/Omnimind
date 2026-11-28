import { noteImageBucket, parseNoteImagePath } from '@/lib/note-image'
import { createClient } from '@/utils/supabase/server'

const headers = {
  'Cache-Control': 'private, no-store',
  'Content-Security-Policy': "sandbox; default-src 'none'",
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return new Response(null, { status: 401, headers })

  const image = parseNoteImagePath(new URL(request.url).searchParams.get('path'))
  if (!image) return new Response(null, { status: 400, headers })

  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15_000)])
  const { data: note, error: noteError } = await supabase.from('notes').select('id')
    .eq('id', image.noteId).eq('user_id', user.id).abortSignal(signal).maybeSingle()
  if (noteError) return new Response(null, { status: 503, headers })
  if (!note) return new Response(null, { status: 404, headers })

  const { data, error } = await supabase.storage.from(noteImageBucket)
    .download(image.path, {}, { signal, cache: 'no-store' })
  if (error || !data) return new Response(null, { status: 404, headers })
  if (!/^image\/[\w.+-]+$/i.test(data.type)) return new Response(null, { status: 415, headers })

  return new Response(data, { headers: { ...headers, 'Content-Type': data.type } })
}
