'use client'

import { useId, useState } from 'react'
import { FileText, ChevronDown } from '@/components/icons'
import PdfImporter from './PdfImporter'

interface CollapsiblePdfImporterProps {
  workspaceId: string
}

export default function CollapsiblePdfImporter({ workspaceId }: CollapsiblePdfImporterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const panelId = useId()

  return (
    <section className="nt-pdf" aria-label="Importação de documento">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="nt-pdf-trigger"
      >
        <span className="nt-pdf-icon"><FileText size={19} aria-hidden="true" /></span>
        <span className="nt-pdf-text">
          <strong>Importar PDF</strong>
          <span>Gere um resumo e flashcards a partir de um documento.</span>
        </span>
        <ChevronDown size={18} className="nt-pdf-chevron" aria-hidden="true" />
      </button>
      
      <div id={panelId} className="nt-pdf-body" hidden={!isOpen}>
        {isOpen && <PdfImporter workspaceId={workspaceId} />}
      </div>
    </section>
  )
}
