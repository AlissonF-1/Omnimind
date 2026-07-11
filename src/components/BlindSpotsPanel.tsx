'use client'

import { useState, useEffect } from 'react'
import { generateReinforcementPrompt, getTutorBlindSpotsDiagnostic, type BlindSpot } from '@/actions/blindspots'
import { AlertTriangle, Brain, Target, Copy, CheckCircle2, Loader2, Sparkles } from 'lucide-react'
import Link from 'next/link'

interface BlindSpotsPanelProps {
  blindSpots: BlindSpot[]
}

export default function BlindSpotsPanel({ blindSpots }: BlindSpotsPanelProps) {
  const [isGenerating, setIsGenerating] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  
  // Estados para o Relatório Diário de Pontos Cegos do Tutor AI
  const [diagnostic, setDiagnostic] = useState<string | null>(null)
  const [isLoadingDiagnostic, setIsLoadingDiagnostic] = useState(false)
  const [copiedNotebookLMPrompt, setCopiedNotebookLMPrompt] = useState(false)

  useEffect(() => {
    const fetchDiagnostic = async () => {
      setIsLoadingDiagnostic(true)
      try {
        const res = await getTutorBlindSpotsDiagnostic()
        if (res.diagnostic) {
          setDiagnostic(res.diagnostic)
        }
      } catch (err) {
        console.error('Erro ao carregar diagnóstico de pontos cegos:', err)
      } finally {
        setIsLoadingDiagnostic(false)
      }
    }
    fetchDiagnostic()
  }, [])

  const handleExportPrompt = async (noteId: string) => {
    setIsGenerating(noteId)
    try {
      const { prompt, error } = await generateReinforcementPrompt(noteId)
      
      if (error || !prompt) {
        alert(error || 'Erro ao gerar prompt')
        return
      }

      await navigator.clipboard.writeText(prompt)
      setCopiedId(noteId)
      setTimeout(() => setCopiedId(null), 3000)
    } catch (e) {
      console.error(e)
    } finally {
      setIsGenerating(null)
    }
  }

  if (!blindSpots || blindSpots.length === 0) return null

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
      
      {/* Widget do Tutor AI: Relatório de Insights de Pontos Cegos */}
      {(isLoadingDiagnostic || diagnostic) && (
        <div className="panel p-5 bg-gradient-to-br from-indigo-500/5 to-primary-soft/5 border-primary/20 hover:border-primary/30 transition-all rounded-2xl relative overflow-hidden group">
          {/* Círculo decorativo blur sutil */}
          <div className="absolute right-0 top-0 translate-x-12 -translate-y-6 w-32 h-32 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-all" />
          
          <div className="flex items-start gap-4 relative z-10">
            <div className="size-10 rounded-xl bg-primary-soft text-primary flex items-center justify-center shrink-0">
              <Sparkles className="size-5" />
            </div>
            
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Insight do Tutor AI</h3>
                {diagnostic && (
                  <button
                    onClick={async () => {
                      const prompt = `Estes são meus pontos fracos mapeados no meu app de estudos:\n"${diagnostic}"\n\nCom base nos meus documentos originais, me explique estes tópicos em linguagem simples e com exemplos adicionais.`
                      await navigator.clipboard.writeText(prompt)
                      setCopiedNotebookLMPrompt(true)
                      setTimeout(() => setCopiedNotebookLMPrompt(false), 2500)
                    }}
                    className="btn-secondary text-[10px] px-2.5 py-1.5 h-auto hover:bg-primary-soft/20 flex items-center gap-1.5 shrink-0 self-start sm:self-center"
                    title="Copiar prompt com este diagnóstico para usar no NotebookLM"
                  >
                    {copiedNotebookLMPrompt ? <CheckCircle2 className="size-3 text-success" /> : <Copy className="size-3 text-primary" />}
                    <span>{copiedNotebookLMPrompt ? 'Prompt Copiado!' : 'Copiar para NotebookLM'}</span>
                  </button>
                )}
              </div>
              
              {isLoadingDiagnostic ? (
                <div className="flex items-center gap-2 text-xs text-text-muted py-1">
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                  <span>Tutor AI analisando seus padrões de erros recentes...</span>
                </div>
              ) : (
                <p className="text-sm text-text-strong font-medium leading-relaxed">
                  {diagnostic}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Painel Clássico de Listagem de Pontos Cegos */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="size-8 rounded-lg bg-error-soft text-error flex items-center justify-center">
            <Target className="size-4" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-strong">Seus Pontos Cegos</h2>
            <p className="text-xs text-text-muted">Tópicos que exigem sua atenção baseados nos erros do FSRS</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {blindSpots.map((spot) => (
            <div key={spot.note_id} className="panel p-5 border-error/20 hover:border-error/40 transition-colors flex flex-col justify-between h-full bg-surface">
              
              <div className="mb-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <Link href={`/dashboard/${spot.workspace_id}/note/${spot.note_id}`} className="font-semibold text-text-strong hover:text-primary transition-colors line-clamp-2">
                    {spot.note_title}
                  </Link>
                  <div className="flex items-center gap-1 bg-error-soft text-error px-2 py-0.5 rounded-full text-xs font-bold shrink-0">
                    <AlertTriangle className="size-3" />
                    {spot.total_lapses} erros
                  </div>
                </div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
                  {spot.workspace_name}
                </p>
              </div>

              <div className="mt-auto pt-4 border-t border-border flex items-center justify-between">
                <span className="text-xs text-text-muted font-medium">
                  {spot.critical_cards} cards críticos
                </span>
                
                <button
                  onClick={() => handleExportPrompt(spot.note_id)}
                  disabled={isGenerating === spot.note_id}
                  className="btn-secondary text-xs px-3 py-1.5 gap-1.5 h-auto transition-all active:scale-95"
                >
                  {isGenerating === spot.note_id ? (
                    <Loader2 className="size-3.5 animate-spin text-primary" />
                  ) : copiedId === spot.note_id ? (
                    <CheckCircle2 className="size-3.5 text-success" />
                  ) : (
                    <Brain className="size-3.5 text-primary" />
                  )}
                  {copiedId === spot.note_id ? 'Prompt Copiado!' : 'Plano de Reforço'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}