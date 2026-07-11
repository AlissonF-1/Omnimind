'use client'

import { useState, useMemo } from 'react'
import { Check, Copy, Eye, EyeOff } from 'lucide-react'

export default function PdfPreview({
  structured,
  onCreate,
  filePath,
  isCreating = false,
}: {
  structured: any
  onCreate: (title: string, markdown: string, doIndex: boolean) => void
  filePath: string
  isCreating?: boolean
}) {
  const [includeFull, setIncludeFull] = useState(false)
  const [doIndex, setDoIndex] = useState(true)
  const [showRawMarkdown, setShowRawMarkdown] = useState(false)
  const [copied, setCopied] = useState(false)

  const title = structured.suggestedNoteTitle || structured.title || 'Nota importada'

  const markdown = useMemo(() => {
    const sections = structured.sections ?? []
    let md = `# ${title}\n\n`
    for (const s of sections) {
      if (s.heading) md += `## ${s.heading}\n\n`
      md += `${s.text}\n\n`
    }
    const isTruncated = !includeFull && md.length > 4000
    if (isTruncated) {
      md = md.slice(0, 4000) + '\n\n<!-- Texto truncado. Ative "Incluir documento completo" para inserir mais. -->'
    }
    return md
  }, [structured, title, includeFull])

  const wordCount = markdown.split(/\s+/).length
  const charCount = markdown.length
  const isTruncated = !includeFull && markdown.length >= 4000

  const handleCopy = async () => {
    await navigator.clipboard.writeText(markdown)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="panel p-4 mt-4 space-y-4">
      <h3 className="text-lg font-semibold">Pré-visualização</h3>
      <p className="text-sm text-text-medium">
        Título sugerido: <strong>{title}</strong>
      </p>

      <div className="text-xs text-text-muted flex gap-4 flex-wrap">
        <span>📄 {wordCount} palavras</span>
        <span>📏 {charCount} caracteres</span>
        {isTruncated && (
          <span className="text-warning font-medium">⚠️ Truncado (máx 4000 caracteres)</span>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setShowRawMarkdown(!showRawMarkdown)}
          className="btn-secondary text-sm"
        >
          {showRawMarkdown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showRawMarkdown ? 'Ocultar Markdown' : 'Ver Markdown bruto'}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="btn-secondary text-sm"
        >
          {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copiado!' : 'Copiar Markdown'}
        </button>
      </div>

      {showRawMarkdown ? (
        <div className="bg-surface-muted p-3 rounded-lg text-xs font-mono whitespace-pre-wrap max-h-60 overflow-y-auto border border-border">
          {markdown}
        </div>
      ) : (
        <div className="prose prose-sm max-w-none border border-border rounded-lg p-4 bg-surface-muted/50 max-h-60 overflow-y-auto">
          {structured.sections?.map((s: any, i: number) => (
            <div key={i} className="mb-3">
              {s.heading && <div className="font-semibold text-text-strong">{s.heading}</div>}
              <div className="text-sm text-text-medium">{s.text}</div>
            </div>
          ))}
          {isTruncated && (
            <div className="text-xs text-warning mt-2 italic">
              ⚠️ Conteúdo truncado. Marque "Incluir documento completo" para ver tudo.
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={includeFull}
            onChange={(e) => setIncludeFull(e.target.checked)}
            className="rounded border-border text-primary focus:ring-primary"
          />
          <span>Incluir documento completo na nota (pode aumentar custo)</span>
        </label>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={doIndex}
            onChange={(e) => setDoIndex(e.target.checked)}
            className="rounded border-border text-primary focus:ring-primary"
          />
          <span>Indexar automaticamente para busca semântica</span>
        </label>
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <button
          className="btn-primary"
          onClick={() => onCreate(title, markdown, doIndex)}
          disabled={isCreating}
        >
          {isCreating ? 'Criando...' : 'Criar nota'}
        </button>
      </div>
    </div>
  )
}