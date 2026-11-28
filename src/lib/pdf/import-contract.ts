export const maxPdfBytes = 10 * 1024 * 1024
export const pdfImportBucket = 'note_files'

export type PdfPreviewData = {
  title: string | null
  authors: string[] | null
  sections: { heading: string | null; text: string }[]
  suggestedNoteTitle: string | null
}

export function parsePdfPath(value: unknown) {
  if (typeof value !== 'string') return null
  const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[a-z0-9][a-z0-9_.-]{0,159}\.pdf$/i.exec(value)
  return match?.[0] === value ? { path: value, workspaceId: match[1] } : null
}
