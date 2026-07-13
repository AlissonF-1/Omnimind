'use client'

import { useState, useEffect, useRef } from 'react'
import { Mic, Square, Loader2, Sparkles, AlertCircle, ArrowLeft, RefreshCw, BookOpen, Layers, CheckCircle2, Copy, Check } from 'lucide-react'
import Link from 'next/link'
import { useSettings } from '@/contexts/SettingsContext'
import ReactMarkdown from 'react-markdown'

interface Workspace {
  id: string
  name: string
  description?: string | null
}

interface FeynmanSandboxProps {
  workspaces: Workspace[]
}

interface FeynmanResult {
  transcription: string
  score: number
  feedback: string
  matchedNotes: string[]
}

export default function FeynmanSandbox({ workspaces }: FeynmanSandboxProps) {
  const { settings } = useSettings()
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>('all')
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadingStep, setLoadingStep] = useState<string>('')
  const [result, setResult] = useState<FeynmanResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // Gerenciamento do microfone e gravação
  const startRecording = async () => {
    setError(null)
    setResult(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      
      // Tenta webm ou ogg, dependendo do suporte do navegador (iOS Safari prefere mp4/aac, mas webm funciona no Chrome/Firefox)
      let options = { mimeType: 'audio/webm' }
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        options = { mimeType: 'audio/ogg' }
        if (!MediaRecorder.isTypeSupported('audio/ogg')) {
          options = { mimeType: 'audio/mp4' }
        }
      }

      const mediaRecorder = new MediaRecorder(stream, options)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType })
        stream.getTracks().forEach(track => track.stop())
        await processAudio(audioBlob)
      }

      mediaRecorder.start()
      setIsRecording(true)
      setDuration(0)
    } catch (err: any) {
      console.error('Erro ao iniciar gravação:', err)
      setError('Não foi possível acessar seu microfone. Verifique as permissões de áudio no seu navegador.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      // Para as faixas sem disparar o processamento do áudio
      const stream = mediaRecorderRef.current.stream
      stream.getTracks().forEach(track => track.stop())
      mediaRecorderRef.current = null
      setIsRecording(false)
      setDuration(0)
    }
  }

  // Timer para contagem dos segundos gravados
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isRecording) {
      interval = setInterval(() => {
        setDuration(prev => {
          if (prev >= 120) { // limite de 2 minutos
            stopRecording()
            return 120
          }
          return prev + 1
        })
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isRecording])

  // Formata duração em mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  // Processa o envio e a chamada à API
  const processAudio = async (blob: Blob) => {
    setIsSubmitting(true)
    setError(null)
    setLoadingStep('Transcrevendo áudio com Groq Whisper...')

    try {
      const formData = new FormData()
      formData.append('file', blob, 'audio.webm')
      if (selectedWorkspace && selectedWorkspace !== 'all') {
        formData.append('workspaceId', selectedWorkspace)
      }

      // Pequeno timeout visual para a transição RAG parecer natural
      const timer = setTimeout(() => {
        setLoadingStep('Buscando notas relacionadas no seu Segundo Cérebro (RAG)...')
      }, 1500)

      const timer2 = setTimeout(() => {
        setLoadingStep('Tutor Feynman analisando lacunas de conhecimento...')
      }, 3500)

      const res = await fetch('/api/sandbox', {
        method: 'POST',
        body: formData,
      })

      clearTimeout(timer)
      clearTimeout(timer2)

      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        throw new Error(errData?.error || 'Erro ao processar sua explicação.')
      }

      const data = await res.json()
      setResult(data)
      
      if (data.unlockedNobel) {
        // Dispara o evento visual e sonoro da conquista secreta "Prêmio Nobel"
        window.dispatchEvent(new CustomEvent('achievement-unlocked', {
          detail: {
            id: 'premio_nobel',
            title: '🏅 Prêmio Nobel',
            description: 'Atingiu precisão superior a 90% em uma explicação no Feynman Sandbox.'
          }
        }))
      }
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Erro de conexão ou processamento no servidor.')
    } finally {
      setIsSubmitting(false)
      setLoadingStep('')
    }
  }

  const handleCopyFeedback = () => {
    if (!result) return
    navigator.clipboard.writeText(result.feedback)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Estilos da pontuação baseada na nota
  const getScoreColorClass = (score: number) => {
    if (score >= 8) return { text: 'text-emerald-500', border: 'border-emerald-500', bg: 'bg-emerald-500/10', glow: 'shadow-[0_0_20px_rgba(16,185,129,0.3)]', msg: 'Excelente domínio! ✨' }
    if (score >= 5) return { text: 'text-amber-500', border: 'border-amber-500', bg: 'bg-amber-500/10', glow: 'shadow-[0_0_20px_rgba(245,158,11,0.3)]', msg: 'Bom caminho, mas há lacunas! ⚖️' }
    return { text: 'text-rose-500', border: 'border-rose-500', bg: 'bg-rose-500/10', glow: 'shadow-[0_0_20px_rgba(244,63,94,0.3)]', msg: 'Precisa de revisão profunda! 📚' }
  }

  const scoreStyle = result ? getScoreColorClass(result.score) : null

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
            <h1 className="page-title text-2xl sm:text-3xl">Feynman Sandbox</h1>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
              Técnica Feynman
            </span>
          </div>
          <p className="page-subtitle text-sm text-text-muted mt-1">
            Explique um conceito em voz alta. A IA vai escutar, cruzar com suas notas e avaliar seu domínio.
          </p>
        </div>
        <Link href="/dashboard" className="btn-secondary text-sm px-4 py-2 inline-flex items-center gap-2 w-full sm:w-auto justify-center">
          <ArrowLeft className="size-4" /> Voltar ao início
        </Link>
      </header>

      {error && (
        <div className="panel border-rose-500/20 bg-rose-500/5 text-rose-500 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle className="size-5 shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Seletor de Workspace e Painel Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="panel p-5 space-y-4">
            <h3 className="font-bold text-sm text-text-strong uppercase tracking-wider flex items-center gap-2">
              <Layers className="size-4 text-primary" /> Foco do RAG
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              Escolha a pasta/workspace para cruzar as informações. A busca RAG priorizará as notas contidas nele.
            </p>
            <div className="space-y-1.5">
              <label htmlFor="workspace-select" className="text-xs font-semibold text-text-medium">Selecionar Workspace</label>
              <select
                id="workspace-select"
                value={selectedWorkspace}
                onChange={(e) => setSelectedWorkspace(e.target.value)}
                disabled={isRecording || isSubmitting}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all disabled:opacity-50"
              >
                <option value="all">Todas as Notas (Geral)</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="panel p-5 bg-gradient-to-br from-indigo-500/5 via-primary/5 to-surface text-xs leading-relaxed space-y-2">
            <h4 className="font-bold text-text-strong flex items-center gap-1.5">
              <BookOpen className="size-4 text-indigo-500" /> Como funciona?
            </h4>
            <p>1. Selecione o assunto ou workspace em que você deseja testar seus conhecimentos.</p>
            <p>2. Clique no microfone e comece a explicar o conceito como se estivesse ensinando uma criança de 10 anos.</p>
            <p>3. A IA ouvirá, comparará os termos com a base de dados do seu Segundo Cérebro e gerará um score de domínio e feedback construtivo.</p>
          </div>
        </div>

        <div className="lg:col-span-2">
          {/* Caixa do Gravador */}
          {!result && !isSubmitting && (
            <div className="panel p-8 md:p-12 flex flex-col items-center justify-center text-center space-y-6 min-h-[350px]">
              {isRecording ? (
                <>
                  <div className="relative">
                    {/* Animação de Onda de Voz */}
                    <div className="absolute inset-0 rounded-full bg-rose-500/20 animate-ping" />
                    <button
                      onClick={stopRecording}
                      className="relative z-10 size-24 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center transition-all hover:scale-105 shadow-lg shadow-rose-500/20"
                    >
                      <Square className="size-8 fill-current" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    <span className="block text-2xl font-black text-text-strong tracking-wide animate-pulse">
                      {formatTime(duration)}
                    </span>
                    <span className="text-sm font-semibold text-rose-500 uppercase tracking-widest block">
                      Explicando em voz alta...
                    </span>
                  </div>
                  <p className="text-xs text-text-muted max-w-sm">
                    Explique com o máximo de clareza possível. Quando terminar, aperte o botão vermelho para finalizar a análise.
                  </p>
                  <button
                    onClick={cancelRecording}
                    className="text-xs font-semibold text-text-muted hover:text-text-strong hover:underline"
                  >
                    Descartar e Cancelar
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={startRecording}
                    className="size-24 rounded-full bg-primary hover:bg-primary-hover text-white flex items-center justify-center transition-all hover:scale-105 shadow-lg shadow-primary/20 group relative"
                  >
                    <div className="absolute -inset-1.5 rounded-full bg-primary/10 opacity-100 group-hover:scale-110 transition-all duration-300" />
                    <Mic className="size-9 relative z-10" />
                  </button>
                  <div className="space-y-1">
                    <h3 className="font-extrabold text-lg text-text-strong">Pronto para testar sua retenção?</h3>
                    <p className="text-sm text-text-muted max-w-sm">
                      Dê o play no microfone e faça uma explicação espontânea de até 2 minutos sobre o assunto desejado.
                    </p>
                    <p className="text-[10px] text-text-muted/70 italic pt-2">
                      💡 Tente ser conciso (máx. 2 min) para uma avaliação mais precisa do tutor.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Estado de Carregamento (Loading) */}
          {isSubmitting && (
            <div className="panel p-8 md:p-12 flex flex-col items-center justify-center text-center space-y-6 min-h-[350px]">
              <div className="relative">
                <div className="absolute -inset-4 rounded-full bg-primary/10 animate-pulse" />
                <Loader2 className="size-16 text-primary animate-spin" />
              </div>
              <div className="space-y-2">
                <h3 className="font-extrabold text-lg text-text-strong animate-pulse">Análise Inteligente em Processamento</h3>
                <p className="text-sm text-text-muted max-w-sm">
                  {loadingStep}
                </p>
              </div>
            </div>
          )}

          {/* Painel do Resultado */}
          {result && !isSubmitting && scoreStyle && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="panel p-6 md:p-8 space-y-6">
                
                {/* Score Header */}
                <div className="flex flex-col sm:flex-row items-center gap-5 pb-5 border-b border-border/60">
                  <div className={`size-20 shrink-0 rounded-full flex flex-col items-center justify-center border-4 ${scoreStyle.border} ${scoreStyle.bg} ${scoreStyle.glow} relative`}>
                    <span className="text-2xl font-black text-text-strong leading-none">{result.score}</span>
                    <span className="text-[10px] text-text-muted font-bold mt-0.5 leading-none">/ 10</span>
                  </div>
                  <div className="text-center sm:text-left space-y-1">
                    <h3 className={`font-black text-xl ${scoreStyle.text}`}>{scoreStyle.msg}</h3>
                    <p className="text-xs text-text-muted">Análise de explicação via técnica de Feynman com RAG e Llama 3</p>
                  </div>
                </div>

                {/* Feedback do Tutor */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-text-strong flex items-center gap-1.5">
                      <Sparkles className="size-4 text-indigo-500 fill-indigo-500/10" /> Feedback do Tutor IA
                    </h4>
                    <button
                      onClick={handleCopyFeedback}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-text-muted hover:text-primary transition-all px-2.5 py-1 rounded-lg hover:bg-surface-muted border border-border/40"
                      title="Copiar feedback para a área de transferência"
                    >
                      {copied ? (
                        <>
                          <Check className="size-3 text-emerald-500" />
                          <span className="text-emerald-500">Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-3" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className={`prose ${settings.ai_font_size === 'small' ? 'prose-sm text-xs' : settings.ai_font_size === 'large' ? 'prose-base' : 'prose-sm'} max-w-none dark:prose-invert prose-p:leading-relaxed prose-strong:text-text-strong prose-li:text-text-muted mt-2`}>
                    <ReactMarkdown>{result.feedback}</ReactMarkdown>
                  </div>
                </div>

                {/* Transcrição Textual */}
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-text-strong">Sua Explicação</h4>
                  <div className="p-4 rounded-2xl bg-surface/50 border border-border/40 text-xs text-text-muted leading-relaxed font-mono max-h-36 overflow-y-auto custom-scrollbar">
                    "{result.transcription}"
                  </div>
                </div>

                {/* Anotações Correlacionadas RAG */}
                {result.matchedNotes.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">Notas consultadas para verificação</h4>
                    <div className="flex flex-wrap gap-2">
                      {result.matchedNotes.map((title, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold bg-surface-muted text-text-medium border border-border/60 rounded-lg px-2.5 py-1"
                        >
                          <BookOpen className="size-3 text-primary" /> {title}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Botões de Ação */}
                <div className="flex flex-col sm:flex-row gap-3 pt-3">
                  <button
                    onClick={startRecording}
                    className="btn-primary h-11 text-sm font-semibold rounded-xl flex-1 flex items-center justify-center gap-2"
                  >
                    <Mic className="size-4" /> Explicar Novamente
                  </button>
                  <button
                    onClick={() => { setResult(null); setError(null) }}
                    className="btn-secondary h-11 text-sm font-semibold rounded-xl flex-1 flex items-center justify-center gap-2 hover:bg-surface-hover"
                  >
                    <RefreshCw className="size-4" /> Limpar Análise
                  </button>
                </div>

              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
