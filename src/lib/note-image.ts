const publicObjectPrefix = '/storage/v1/object/public/note_images/'

export const noteImageBucket = 'note_images'

export function parseNoteImagePath(path: unknown) {
  if (typeof path !== 'string' || path.length > 256) return null
  const match = /^([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\/([a-z0-9][a-z0-9._-]*)$/i.exec(path)
  return match && match[0] === path ? { noteId: match[1], path } : null
}

export function noteImageUrl(path: string) {
  return '/api/notes/image?path=' + encodeURIComponent(path)
}

export function replaceLegacyNoteImageUrl(value: string, supabaseUrl: string | undefined) {
  if (!supabaseUrl || !/^https?:\/\//i.test(value)) return value

  try {
    const source = new URL(value)
    if (source.origin !== new URL(supabaseUrl).origin || !source.pathname.startsWith(publicObjectPrefix)) return value
    const image = parseNoteImagePath(decodeURIComponent(source.pathname.slice(publicObjectPrefix.length)))
    return image ? noteImageUrl(image.path) : value
  } catch {
    return value
  }
}
