'use client'

import { useState, useEffect, useRef } from 'react'
import { Mic, Square, Loader2, Sparkles, AlertCircle, ArrowLeft, RefreshCw, BookOpen, Check, Copy, FileText, Trash2, Award } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
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
  strengths: string
  gaps: string
  corrections: string
  mentioned: string[]
  forgotten: string[]
  matchedNotes: string[]
}

interface HistoryItem {
  id: string
  workspaceName: string
  score: number
  date: string
}

export default function FeynmanSandbox({ workspaces }: FeynmanSandboxProps) {
  const { settings } = useSettings()
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>('all')
  const [mode, setMode] = useState<'voice' | 'text'>('voice')
  const [textInput, setTextInput] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadingStep, setLoadingStep] = useState('')
  const [result, setResult] = useState<FeynmanResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'strengths' | 'gaps' | 'corrections'>('strengths')
  const [history, setHistory] = useState<HistoryItem[]>([])

  // Refs de gravação
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  
  // Refs do Visualizador de Áudio Canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  // Carrega histórico do LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem('feynman_history')
    if (saved) {
      try {
        setHistory(JSON.parse(saved))
      } catch (e) {
        console.error(e)
      }
    }
  }, [])

  // Timer para gravação (limite de 2 minutos)
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isRecording) {
      interval = setInterval(() => {
        setDuration(prev => {
          if (prev >= 120) {
            stopRecording()
            return 120
          }
          return prev + 1
        })
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isRecording])

  // Limpa o loop do visualizador se a gravação parar
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      if (audioContextRef.current) audioContextRef.current.close()
    }
  }, [])

  // Inicia gravação com analisador de ondas de som
  const startRecording = async () => {
    setError(null)
    setResult(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      
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
        await processExplanation(audioBlob, null)
      }

      // --- Waveform Analyser Setup ---
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const analyser = audioContext.createAnalyser()
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)
      analyser.fftSize = 64 // Menor resolução para uma onda mais suave e grossa
      
      audioContextRef.current = audioContext
      analyserRef.current = analyser

      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      const drawWave = () => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        animationFrameRef.current = requestAnimationFrame(drawWave)
        analyser.getByteFrequencyData(dataArray)

        // Limpa canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        
        const barWidth = (canvas.width / bufferLength) * 1.8
        let barHeight
        let x = 0

        for (let i = 0; i < bufferLength; i++) {
          barHeight = dataArray[i] * 0.4 // Ajusta altura da onda

          // Cria gradiente vertical para a onda
          const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0)
          gradient.addColorStop(0, '#f43f5e') // Rose
          gradient.addColorStop(1, '#6366f1') // Indigo

          ctx.fillStyle = gradient
          
          // Desenha barra simétrica (onda centralizada verticalmente)
          const y = (canvas.height - barHeight) / 2
          ctx.fillRect(x, y, barWidth - 2, barHeight)

          x += barWidth
        }
      }

      mediaRecorder.start()
      setIsRecording(true)
      setDuration(0)
      
      // Pequeno delay para garantir montagem do canvas
      setTimeout(drawWave, 100)

    } catch (err: any) {
      console.error('Erro ao iniciar gravação:', err)
      setError('Não foi possível acessar seu microfone. Verifique as permissões de áudio no seu navegador.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
    }
  }

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      const stream = mediaRecorderRef.current.stream
      stream.getTracks().forEach(track => track.stop())
      mediaRecorderRef.current = null
      setIsRecording(false)
      setDuration(0)
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
    }
  }

  // Envia a explicação para processamento (Voz ou Texto)
  const processExplanation = async (blob: Blob | null, textStr: string | null) => {
    setIsSubmitting(true)
    setError(null)
    setLoadingStep(blob ? 'Transcrevendo áudio com Groq Whisper...' : 'Indexando anotações do RAG...')

    try {
      const formData = new FormData()
      if (blob) {
        formData.append('file', blob, 'audio.webm')
      }
      if (textStr) {
        formData.append('text', textStr)
      }
      if (selectedWorkspace && selectedWorkspace !== 'all') {
        formData.append('workspaceId', selectedWorkspace)
      }

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
      setActiveTab('strengths')

      // Adiciona tentativa no histórico local
      const wsName = selectedWorkspace === 'all' ? 'Notas Gerais' : workspaces.find(w => w.id === selectedWorkspace)?.name || 'Notas Gerais'
      const newAttempt: HistoryItem = {
        id: Date.now().toString(),
        workspaceName: wsName,
        score: data.score,
        date: new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }),
      }
      const updatedHistory = [newAttempt, ...history.slice(0, 4)]
      setHistory(updatedHistory)
      localStorage.setItem('feynman_history', JSON.stringify(updatedHistory))

      if (data.unlockedNobel) {
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

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!textInput.trim()) return
    processExplanation(null, textInput.trim())
  }

  const handleCopyFeedback = () => {
    if (!result) return
    const textToCopy = `Score: ${result.score}/10\n\n[Pontos Fortes]\n${result.strengths}\n\n[Lacunas]\n${result.gaps}\n\n[Correções]\n${result.corrections}`
    navigator.clipboard.writeText(textToCopy)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const clearHistory = () => {
    setHistory([])
    localStorage.removeItem('feynman_history')
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const getScoreColorClass = (score: number) => {
    if (score >= 8) return { text: 'text-emerald-500', border: 'border-emerald-500', bg: 'bg-emerald-500/10', glow: 'shadow-[0_0_20px_rgba(16,185,129,0.35)]', msg: 'Excelente domínio! ✨' }
    if (score >= 5) return { text: 'text-amber-500', border: 'border-amber-500', bg: 'bg-amber-500/10', glow: 'shadow-[0_0_20px_rgba(245,158,11,0.35)]', msg: 'Bom caminho, mas há lacunas! ⚖️' }
    return { text: 'text-rose-500', border: 'border-rose-500', bg: 'bg-rose-500/10', glow: 'shadow-[0_0_20px_rgba(244,63,94,0.35)]', msg: 'Precisa de revisão profunda! 📚' }
  }

  const scoreStyle = result ? getScoreColorClass(result.score) : null

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
            <Image src="/images/empty_state_astronaut.png" alt="Astronauta" width={40} height={40} className="object-contain drop-shadow-md hidden sm:block animate-bounce duration-[3s]" />
            <h1 className="page-title text-2xl sm:text-3xl flex items-center gap-2">
              <span className="sm:hidden"><Image src="/images/empty_state_astronaut.png" alt="Astronauta" width={28} height={28} className="object-contain drop-shadow-md" /></span>
              Feynman Sandbox
            </h1>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              Técnica Feynman
            </span>
          </div>
          <p className="page-subtitle text-xs sm:text-sm text-text-muted mt-1 leading-snug">
            Explique um conceito em voz alta ou digite. A IA vai analisar, cruzar com suas notas e mensurar seu domínio.
          </p>
        </div>
        <Link href="/dashboard" className="btn-secondary text-xs font-bold px-4 py-2 inline-flex items-center gap-2 w-full sm:w-auto justify-center rounded-xl cursor-pointer">
          <ArrowLeft className="size-4" /> Voltar ao início
        </Link>
      </header>

      {error && (
        <div className="panel border-rose-500/20 bg-rose-500/5 text-rose-500 p-4 rounded-xl flex items-start gap-3 animate-in fade-in duration-300">
          <AlertCircle className="size-5 shrink-0 mt-0.5" />
          <p className="text-xs sm:text-sm font-bold">{error}</p>
        </div>
      )}

      {/* Seletor de Workspace e Painel Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6 flex flex-col order-last lg:order-first">
          
          {/* Seletor de Workspace */}
          <div className="panel p-5 space-y-4">
            <h3 className="font-black text-xs text-text-strong uppercase tracking-wider flex items-center gap-2">
              <Image src="/images/stat_cards_3d.png" alt="Foco RAG" width={20} height={20} className="object-contain" /> Foco do RAG
            </h3>
            <p className="text-[11px] text-text-muted leading-relaxed">
              Escolha o workspace para cruzar as informações. A busca semântica priorizará as notas contidas nele.
            </p>
            <div className="space-y-1.5">
              <label htmlFor="workspace-select" className="text-[10px] font-extrabold text-text-medium uppercase tracking-wider">Selecionar Workspace</label>
              <select
                id="workspace-select"
                value={selectedWorkspace}
                onChange={(e) => setSelectedWorkspace(e.target.value)}
                disabled={isRecording || isSubmitting}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-xs font-bold focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all disabled:opacity-50 cursor-pointer"
              >
                <option value="all">📂 Todas as Notas (Geral)</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Histórico de Tentativas */}
          <div className="panel p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-xs text-text-strong uppercase tracking-wider flex items-center gap-2">
                <Award className="size-4 text-amber-500" /> Histórico Recente
              </h3>
              {history.length > 0 && (
                <button onClick={clearHistory} className="text-[10px] font-bold text-text-muted hover:text-red-400 transition-colors flex items-center gap-1 cursor-pointer">
                  <Trash2 className="size-3" /> Limpar
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <p className="text-xs text-text-muted italic">Nenhuma tentativa registrada localmente.</p>
            ) : (
              <div className="space-y-2.5">
                {history.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-muted/50 border border-border">
                    <div className="min-w-0">
                      <p className="font-bold text-xs text-text-strong truncate">{item.workspaceName}</p>
                      <p className="text-[9px] text-text-muted mt-0.5">{item.date}</p>
                    </div>
                    <div className={`text-xs font-black px-2 py-1 rounded-lg ${
                      item.score >= 8 ? 'bg-emerald-500/10 text-emerald-500' : item.score >= 5 ? 'bg-amber-500/10 text-amber-500' : 'bg-rose-500/10 text-rose-500'
                    }`}>
                      {item.score}/10
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Painel de Entrada de Explicação */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Tabs de Modo Voz vs Modo Texto */}
          <div className="flex bg-surface-muted p-1 rounded-xl border border-border">
            <button
              onClick={() => { if (!isRecording && !isSubmitting) setMode('voice') }}
              disabled={isRecording || isSubmitting}
              className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                mode === 'voice' ? 'bg-surface text-text-strong shadow-sm' : 'text-text-muted hover:text-text-strong'
              }`}
            >
              <Mic className="size-3.5" /> Explicar por Voz
            </button>
            <button
              onClick={() => { if (!isRecording && !isSubmitting) setMode('text') }}
              disabled={isRecording || isSubmitting}
              className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                mode === 'text' ? 'bg-surface text-text-strong shadow-sm' : 'text-text-muted hover:text-text-strong'
              }`}
            >
              <FileText className="size-3.5" /> Explicar por Texto
            </button>
          </div>

          {/* Área do Gravador ou Campo de Digitação */}
          {!result && !isSubmitting && (
            <div className="panel p-6 md:p-8 flex flex-col min-h-[350px]">
              
              {mode === 'voice' ? (
                // --- MODO GRAVAÇÃO DE VOZ ---
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
                  {isRecording ? (
                    <>
                      <div className="relative w-full max-w-[280px] h-[70px] flex items-center justify-center">
                        {/* Canvas do Waveform Real-time */}
                        <canvas ref={canvasRef} width={280} height={70} className="w-full h-full rounded-xl bg-transparent" />
                      </div>
                      
                      <button
                        onClick={stopRecording}
                        className="size-20 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center transition-all hover:scale-105 shadow-lg shadow-rose-500/20 cursor-pointer"
                      >
                        <Square className="size-6 fill-current" />
                      </button>

                      <div className="space-y-1">
                        <span className="block text-2xl font-black text-text-strong tracking-wide animate-pulse">
                          {formatTime(duration)}
                        </span>
                        <span className="text-[10px] font-extrabold text-rose-500 uppercase tracking-widest block">
                          Tutor Feynman gravando...
                        </span>
                      </div>
                      
                      <button
                        onClick={cancelRecording}
                        className="text-xs font-semibold text-text-muted hover:text-text-strong hover:underline cursor-pointer"
                      >
                        Descartar e Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={startRecording}
                        className="size-24 rounded-full bg-primary hover:bg-primary-hover text-white flex items-center justify-center transition-all hover:scale-105 shadow-lg shadow-primary/20 group relative cursor-pointer"
                      >
                        <div className="absolute -inset-1.5 rounded-full bg-primary/10 opacity-100 group-hover:scale-110 transition-all duration-300" />
                        <Mic className="size-9 relative z-10 animate-pulse" />
                      </button>
                      <div className="space-y-1.5">
                        <h3 className="font-extrabold text-base text-text-strong">Explicação por Voz</h3>
                        <p className="text-xs text-text-muted max-w-sm mx-auto">
                          Ative o microfone e explique espontaneamente (até 2 minutos) o conceito aprendido para simular o ensino a outra pessoa.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                // --- MODO DIGITAÇÃO TEXTUAL ---
                <form onSubmit={handleTextSubmit} className="flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-1.5">
                    <h3 className="font-extrabold text-base text-text-strong">Sua Explicação Escrita</h3>
                    <p className="text-[11px] text-text-muted">
                      Digite abaixo uma explicação simplificada e direta (como se estivesse ensinando uma criança de 10 anos) sobre o tema selecionado.
                    </p>
                  </div>
                  <textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Comece a escrever sua explicação aqui..."
                    required
                    className="w-full flex-1 min-h-[160px] rounded-xl border border-border bg-surface px-4 py-3 text-xs text-text-strong placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/45 outline-none transition-all resize-none custom-scrollbar"
                  />
                  <button
                    type="submit"
                    disabled={!textInput.trim()}
                    className="btn-primary w-full py-3 text-xs font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="size-3.5" /> Analisar Explicação
                  </button>
                </form>
              )}

            </div>
          )}

          {/* Estado de Carregamento (Loading) */}
          {isSubmitting && (
            <div className="panel p-6 md:p-8 flex flex-col items-center justify-center text-center space-y-6 min-h-[350px] animate-in fade-in duration-300">
              <div className="relative">
                <div className="absolute -inset-4 rounded-full bg-primary/10 animate-pulse" />
                <Loader2 className="size-14 text-primary animate-spin" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-extrabold text-base text-text-strong animate-pulse">Tutor IA Analisando</h3>
                <p className="text-xs text-text-muted max-w-xs mx-auto">
                  {loadingStep}
                </p>
              </div>
            </div>
          )}

          {/* Painel do Resultado */}
          {result && !isSubmitting && scoreStyle && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="panel p-5 sm:p-6 space-y-6">
                
                {/* Score Header */}
                <div className="flex flex-col sm:flex-row items-center gap-5 pb-5 border-b border-border/40">
                  <div className={`size-16 shrink-0 rounded-full flex flex-col items-center justify-center border-4 ${scoreStyle.border} ${scoreStyle.bg} ${scoreStyle.glow} relative`}>
                    <span className="text-xl font-black text-text-strong leading-none">{result.score}</span>
                    <span className="text-[9px] text-text-muted font-bold mt-0.5 leading-none">/ 10</span>
                  </div>
                  <div className="text-center sm:text-left space-y-0.5">
                    <h3 className={`font-black text-lg ${scoreStyle.text}`}>{scoreStyle.msg}</h3>
                    <p className="text-[10px] text-text-muted">Avaliação computada com RAG + IA (Llama 3)</p>
                  </div>
                </div>

                {/* Abas e Feedback Estruturado */}
                <div className="space-y-4">
                  
                  {/* Seletor de Abas de Feedback */}
                  <div className="flex bg-surface-muted p-1 rounded-lg border border-border flex-wrap sm:flex-nowrap gap-1">
                    <button
                      onClick={() => setActiveTab('strengths')}
                      className={`flex-1 py-1.5 rounded-md text-[10px] sm:text-xs font-bold transition-all cursor-pointer ${
                        activeTab === 'strengths' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'text-text-muted hover:text-text-strong'
                      }`}
                    >
                      🟢 Pontos Fortes
                    </button>
                    <button
                      onClick={() => setActiveTab('gaps')}
                      className={`flex-1 py-1.5 rounded-md text-[10px] sm:text-xs font-bold transition-all cursor-pointer ${
                        activeTab === 'gaps' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'text-text-muted hover:text-text-strong'
                      }`}
                    >
                      🟡 Lacunas
                    </button>
                    {result.corrections && (
                      <button
                        onClick={() => setActiveTab('corrections')}
                        className={`flex-1 py-1.5 rounded-md text-[10px] sm:text-xs font-bold transition-all cursor-pointer ${
                          activeTab === 'corrections' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'text-text-muted hover:text-text-strong'
                        }`}
                      >
                        🔴 Correções
                      </button>
                    )}
                  </div>

                  {/* Conteúdo da Aba Ativa */}
                  <div className="p-4 rounded-xl bg-surface-muted/50 border border-border min-h-[120px]">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-text-strong">
                        {activeTab === 'strengths' ? '🟢 O que você dominou' : activeTab === 'gaps' ? '🟡 O que faltou' : '🔴 Erros detectados'}
                      </h4>
                      
                      <button
                        onClick={handleCopyFeedback}
                        className="text-text-muted hover:text-primary transition-all p-1 hover:bg-surface rounded cursor-pointer"
                        title="Copiar feedback completo"
                      >
                        {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                      </button>
                    </div>

                    <div className="text-xs text-text-medium leading-relaxed prose dark:prose-invert prose-sm">
                      <ReactMarkdown>
                        {activeTab === 'strengths' 
                          ? result.strengths 
                          : activeTab === 'gaps' 
                          ? result.gaps 
                          : result.corrections}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>

                {/* Active Recall: Conceitos Citados vs Esquecidos */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  
                  {/* Citados */}
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-extrabold text-emerald-500 uppercase tracking-widest flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-emerald-500" /> Conceitos Citados ({result.mentioned.length})
                    </h4>
                    {result.mentioned.length === 0 ? (
                      <p className="text-[11px] text-text-muted italic">Nenhum termo técnico detectado.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {result.mentioned.map((term, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/15 rounded-lg px-2.5 py-1">
                            ✓ {term}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Esquecidos */}
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-extrabold text-rose-500 uppercase tracking-widest flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" /> Conceitos Esquecidos ({result.forgotten.length})
                    </h4>
                    {result.forgotten.length === 0 ? (
                      <p className="text-[11px] text-text-muted italic">Nenhum termo importante esquecido.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {result.forgotten.map((term, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-[10px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/15 rounded-lg px-2.5 py-1">
                            ✗ {term}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Transcrição de Áudio ou Texto Explicado */}
                <div className="space-y-2 pt-2 border-t border-border/30">
                  <h4 className="text-[10px] font-extrabold text-text-muted uppercase tracking-wider">Sua Explicação</h4>
                  <div className="p-3.5 rounded-xl bg-surface/50 border border-border/40 text-[11px] text-text-muted leading-relaxed font-mono max-h-24 overflow-y-auto custom-scrollbar">
                    "{result.transcription}"
                  </div>
                </div>

                {/* Notas correlacionadas pelo RAG */}
                {result.matchedNotes.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[9px] font-extrabold text-text-muted uppercase tracking-wider">Notas analisadas pelo tutor</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {result.matchedNotes.map((title, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1 text-[10px] font-bold bg-surface-muted text-text-medium border border-border/60 rounded-lg px-2.5 py-1">
                          <BookOpen className="size-3 text-primary" /> {title}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Botões de Ação */}
                <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-border/30">
                  <button
                    onClick={() => { setResult(null); setError(null); setTextInput('') }}
                    className="btn-primary h-11 text-xs font-bold rounded-xl flex-1 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Mic className="size-4" /> Explicar Novamente
                  </button>
                  <button
                    onClick={() => { setResult(null); setError(null); setTextInput('') }}
                    className="btn-secondary h-11 text-xs font-bold rounded-xl flex-1 flex items-center justify-center gap-2 hover:bg-surface-hover cursor-pointer"
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
