'use client';
import { Sigma, X } from 'lucide-react';

interface LaTeXAssistProps {
  onInsert: (latex: string, selection?: { startOffset: number; endOffset: number }) => void;
  onClose: () => void;
  variant?: 'popover' | 'sheet';
}

const SYMBOLS = [
  { label: 'Fração', code: '\\frac{a}{b}' },
  { label: 'Raiz', code: '\\sqrt{x}' },
  { label: 'Integral', code: '\\int_{a}^{b} f(x) dx' },
  { label: 'Somatório', code: '\\sum_{i=1}^{n} i' },
  { label: 'Limite', code: '\\lim_{x \\to \\infty} f(x)' },
  { label: 'α (Alfa)', code: '\\alpha' },
  { label: 'β (Beta)', code: '\\beta' },
  { label: 'π (Pi)', code: '\\pi' },
];

export default function LaTeXAssist({ onInsert, onClose, variant = 'popover' }: LaTeXAssistProps) {
  const isSheet = variant === 'sheet'

  return (
    <div className={isSheet ? 'flex h-full w-full flex-col rounded-t-[1.75rem] border-t border-border bg-surface shadow-2xl animate-in slide-in-from-bottom-4 duration-200' : 'absolute z-50 w-60 p-3 bg-surface border border-border rounded-xl shadow-xl animate-in fade-in zoom-in-95 duration-200'}>
      <div className={`flex items-center justify-between ${isSheet ? 'border-b border-border px-4 py-3' : 'mb-2'}`}>
        <span className={`font-bold text-text-strong ${isSheet ? 'text-sm' : 'text-xs'}`}>LaTeX Assist</span>
        <button onClick={onClose} className="text-text-muted hover:text-text-strong"><X className="size-3.5" /></button>
      </div>
      <div className={`grid grid-cols-2 gap-1.5 ${isSheet ? 'flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]' : ''}`}>
        {SYMBOLS.map((sym) => (
          <button
            key={sym.label}
            onClick={() => {
              if (sym.label === 'Fração') {
                onInsert(sym.code, { startOffset: 6, endOffset: 7 })
              } else {
                onInsert(sym.code)
              }
              onClose()
            }}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border hover:bg-surface-muted transition-colors text-xs text-left font-mono text-text-strong"
          >
            <Sigma className="size-3 text-primary" />
            <span>{sym.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}