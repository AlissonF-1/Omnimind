'use client'

import { useState } from 'react'
import { FileText, ChevronDown, ChevronUp } from 'lucide-react'
import PdfImporter from './PdfImporter'

interface CollapsiblePdfImporterProps {
  workspaceId: string
}

export default function CollapsiblePdfImporter({ workspaceId }: CollapsiblePdfImporterProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <section className="mb-4 rounded-xl border border-border bg-surface-muted/30 transition-colors hover:border-primary/30">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 sm:p-4 text-left outline-none focus:outline-none"
      >
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="size-4 text-primary shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wider text-text-strong">
            Importar PDF
          </span>
          <span className="text-[10px] text-text-muted normal-case font-medium truncate">
            (para alimentar esta nota com resumos/flashcards)
          </span>
        </div>
        <div className="text-text-muted hover:text-text-strong transition-colors shrink-0 pl-2">
          {isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </div>
      </button>
      
      {isOpen && (
        <div className="p-3 sm:p-4 border-t border-border/40 animate-in fade-in slide-in-from-top-2 duration-200">
          <PdfImporter workspaceId={workspaceId} />
        </div>
      )}
    </section>
  )
}
