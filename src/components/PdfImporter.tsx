'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import PdfPreview from './PdfPreview'
import { Upload, X, FileText, AlertCircle, CheckCircle, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'

interface PdfImporterProps {
  workspaceId: string
}

export default function PdfImporter({ workspaceId }: PdfImporterProps) {
  const supabase = createClient()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingProgress, setProcessingProgress] = useState(0)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isCreatingNote, setIsCreatingNote] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const processingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const MAX_MB = 10

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      if (processingIntervalRef.current) {
        clearInterval(processingIntervalRef.current)
        processingIntervalRef.current = null
      }
    }
  }, [])

  const resetState = () => {
    setFile(null)
    setUploading(false)
    setUploadProgress(0)
    setIsProcessing(false)
    setProcessingProgress(0)
    setFilePath(null)
    setPreviewData(null)
    setError(null)
    setSuccessMessage(null)
    setIsCreatingNote(false)
    if (inputRef.current) inputRef.current.value = ''
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    if (processingIntervalRef.current) {
      clearInterval(processingIntervalRef.current)
      processingIntervalRef.current = null
    }
  }

  const deleteFileFromStorage = async (path: string) => {
    try {
      await supabase.storage.from('note_files').remove([path])
    } catch (_) {}
  }

  const handleFile = async (f: File | null) => {
    resetState()
    if (!f) return

    if (!f.type.includes('pdf')) {
      setError('Apenas arquivos PDF são permitidos')
      return
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`Arquivo excede ${MAX_MB} MB`)
      return
    }

    setFile(f)
    setUploading(true)
    setUploadProgress(0)

    try {
      // Verifica bucket
      const { error: listError } = await supabase.storage.from('note_files').list('', { limit: 1 })
      if (listError) {
        setError('Bucket "note_files" não encontrado no Supabase. Crie um bucket chamado "note_files" no painel do Supabase.')
        setUploading(false)
        return
      }

      const fileExt = f.name.split('.').pop()
      const fileName = `${Date.now()}.${fileExt}`
      const filePathLocal = `${workspaceId}/${fileName}`

      // Upload via Supabase (sem progresso nativo, mas simulamos)
      const { error: uploadError } = await supabase.storage.from('note_files').upload(filePathLocal, f)
      if (uploadError) throw uploadError

      // Simula progresso (já que o método upload não dá progresso)
      setUploadProgress(100)

      setFilePath(filePathLocal)
      setUploading(false)

      // Signed URL
      const { data: signedData, error: signedError } = await supabase.storage
        .from('note_files')
        .createSignedUrl(filePathLocal, 60)
      if (signedError || !signedData?.signedUrl) {
        throw signedError || new Error('Falha ao criar signedUrl')
      }

      // Extração com progresso simulado
      setIsProcessing(true)
      setProcessingProgress(0)
      abortControllerRef.current = new AbortController()

      let progress = 0
      processingIntervalRef.current = setInterval(() => {
        progress = Math.min(progress + 2, 90)
        setProcessingProgress(progress)
      }, 200)

      const resp = await fetch('/api/pdf/extract', {
        method: 'POST',
        body: JSON.stringify({ signedUrl: signedData.signedUrl, mode: 'summary' }),
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: abortControllerRef.current.signal,
      })

      if (processingIntervalRef.current) {
        clearInterval(processingIntervalRef.current)
        processingIntervalRef.current = null
      }
      setProcessingProgress(100)

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}))
        throw new Error(errJson.error || `Erro ${resp.status}`)
      }
      const json = await resp.json()
      if (json?.error) throw new Error(json.error)

      setPreviewData(json.structured)
      setIsProcessing(false)
      setSuccessMessage('PDF processado com sucesso! Revise os dados abaixo.')

    } catch (e: any) {
      if (processingIntervalRef.current) {
        clearInterval(processingIntervalRef.current)
        processingIntervalRef.current = null
      }
      setUploading(false)
      setIsProcessing(false)
      if (filePath) {
        await deleteFileFromStorage(filePath)
        setFilePath(null)
      }
      const msg = e.message || 'Erro no processamento do PDF'
      if (e.name === 'AbortError') {
        setError('Processamento cancelado pelo usuário.')
      } else {
        setError(msg)
      }
    } finally {
      setUploading(false)
      setIsProcessing(false)
    }
  }

  const handleCreateNote = async (title: string, markdownContent: string, doIndex = true) => {
    setIsCreatingNote(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const session = await supabase.auth.getSession()
      const token = session?.data?.session?.access_token
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const resp = await fetch('/api/pdf/create-note', {
        method: 'POST',
        body: JSON.stringify({ workspaceId, title, content: markdownContent, doIndex }),
        headers,
        credentials: 'include',
      })
      const json = await resp.json()
      if (json?.error) throw new Error(json.error)

      setSuccessMessage('Nota criada com sucesso!')
      setTimeout(() => resetState(), 2000)
    } catch (e: any) {
      setError(e.message || 'Erro ao criar nota')
    } finally {
      setIsCreatingNote(false)
    }
  }

  const handleCancel = async () => {
    if (isProcessing && abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setError('Processamento cancelado')
      setIsProcessing(false)
      if (filePath) {
        await deleteFileFromStorage(filePath)
        setFilePath(null)
      }
      resetState()
    } else if (uploading) {
      // Não podemos abortar o upload nativo, mas podemos marcar como cancelado e deletar depois
      setError('Upload cancelado')
      setUploading(false)
      if (filePath) {
        await deleteFileFromStorage(filePath)
        setFilePath(null)
      }
      resetState()
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFile(files[0])
    }
  }

  return (
    <div className="space-y-6" role="region" aria-label="Importador de PDF">
      {!previewData && (
        <div
          className={`
            relative border-2 border-dashed rounded-2xl p-4 sm:p-8 transition-all duration-200
            ${error ? 'border-error/50 bg-error-soft/10' : 'border-border hover:border-primary/50'}
            ${uploading || isProcessing ? 'opacity-60 pointer-events-none' : ''}
          `}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            {!file && !uploading && !isProcessing && (
              <>
                <Upload className="w-12 h-12 text-text-muted" strokeWidth={1.5} />
                <div>
                  <p className="text-sm font-medium text-text-strong">
                    Arraste seu PDF aqui ou clique para selecionar
                  </p>
                  <p className="text-xs text-text-muted mt-1">
                    Máx. {MAX_MB} MB · Apenas arquivos PDF
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="btn-primary mt-2"
                  disabled={uploading || isProcessing}
                >
                  Selecionar PDF
                </button>
              </>
            )}

            {(uploading || isProcessing) && (
              <div className="w-full max-w-sm space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-text-strong">
                    {uploading ? 'Enviando...' : 'Processando...'}
                  </span>
                  <span className="text-text-muted">
                    {uploading ? uploadProgress : processingProgress}%
                  </span>
                </div>
                <div className="h-2 bg-surface-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${uploading ? uploadProgress : processingProgress}%` }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="text-sm text-error hover:underline flex items-center justify-center gap-1"
                >
                  <X className="w-4 h-4" /> Cancelar
                </button>
              </div>
            )}

            {file && !uploading && !isProcessing && !previewData && (
              <div className="flex items-center gap-3 text-sm">
                <FileText className="w-5 h-5 text-primary" />
                <span className="text-text-strong">{file.name}</span>
                <span className="text-text-muted">
                  ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </span>
                <button
                  type="button"
                  onClick={resetState}
                  className="text-text-muted hover:text-error transition-colors"
                  aria-label="Remover arquivo"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            aria-label="Selecionar arquivo PDF"
          />
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 p-4 bg-error-soft/30 dark:bg-error-soft/10 border-l-4 border-l-error border border-border/50 rounded-r-xl rounded-l-md text-error text-sm shadow-[0_2px_12px_rgba(220,38,38,0.05)] animate-in fade-in slide-in-from-top-2 duration-200">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-error" />
          <span className="flex-1 font-medium">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 hover:opacity-70 text-error/60 hover:text-error transition-colors"
            aria-label="Fechar erro"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="flex items-start gap-3 p-4 bg-success-soft/30 dark:bg-success-soft/10 border-l-4 border-l-success border border-border/50 rounded-r-xl rounded-l-md text-success text-sm shadow-[0_2px_12px_rgba(34,197,94,0.05)] animate-in fade-in slide-in-from-top-2 duration-200">
          <CheckCircle className="w-5 h-5 shrink-0 mt-0.5 text-success" />
          <span className="flex-1 font-medium">{successMessage}</span>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="shrink-0 hover:opacity-70 text-success/60 hover:text-success transition-colors"
            aria-label="Fechar mensagem"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {previewData && filePath && (
        <div className="border-t border-border pt-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <PdfPreview
            structured={previewData}
            onCreate={(title, markdown, doIndex) => handleCreateNote(title, markdown, doIndex)}
            filePath={filePath}
          />
          {isCreatingNote && (
            <div className="flex items-center gap-2 text-sm text-text-muted mt-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Criando nota...
            </div>
          )}
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <button
              type="button"
              onClick={resetState}
              className="btn-secondary text-sm"
              disabled={isCreatingNote}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                resetState()
                setTimeout(() => {
                  inputRef.current?.click()
                }, 50)
              }}
              className="btn-secondary text-sm flex items-center gap-2"
              disabled={isCreatingNote}
              title="Substituir PDF"
            >
              <RefreshCw className="size-3.5" />
              <span>Substituir PDF</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}