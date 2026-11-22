'use client'

import { useState, useEffect, useEffectEvent, useRef, useCallback } from 'react'
import Image from 'next/image'
import { Rating } from 'ts-fsrs'
import { submitReview } from '@/actions/reviews'
import { deleteFlashcard } from '@/actions/flashcards'
import { addXp, getStreakJeopardyStatus, rescueStreak, grantBossVictory } from '@/actions/achievements'
import { XP_CONFIG } from '@/types/achievements'
import { checkNoteRelearningAlert } from '@/actions/stats'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import md5 from 'crypto-js/md5'
// NOVOS ÍCONES ADICIONADOS
import {
  ArrowRight,
  Mic,
  Square,
  RotateCcw,
  FileText,
  Lightbulb,
  Brain,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  X,
  Keyboard,
  Sparkles,
  Loader2,
  BrainCircuit,
  Eye,
  Headphones,
  Volume2,
  VolumeX,
  PlayCircle,
  Flame,
  Swords,
  Ghost,
  Zap,
} from 'lucide-react'
import RelearningAlert from './RelearningAlert'
import { useSettings } from '@/contexts/SettingsContext'
import { getBestVoice, playButtonClick, playEvaluationSound } from '@/utils/audio'
import { evaluateAnswerWithGroq, generateDistractorsWithGroq } from '@/actions/groq'
import { searchYoutubeExplanation } from '@/actions/externalContent' // NOVA IMPORT
import { useOfflineSync } from '@/hooks/useOfflineSync'
import OfflineBanner from '@/components/OfflineBanner'
import { saveCardsToCache, getCachedCards, savePendingReview } from '@/utils/offlineStore'

interface ReviewCard {
  id: string
  front: string
  back: string
  analogia?: string | null
  mnemonico?: string | null
  source_anchor?: string | null
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  reps: number
  lapses: number
  state: number
  notes: {
    id: string
    title: string
    content: string
    workspace_id: string
  }
}

interface ReviewPanelProps {
  initialCards: ReviewCard[]
  mode?: 'default' | 'ultimato'
  workspaceId?: string
  noteId?: string
}

const reviewRatings = [
  { grade: Rating.Again, key: '1', tone: 'again', label: 'Errei' },
  { grade: Rating.Hard, key: '2', tone: 'hard', label: 'Difícil' },
  { grade: Rating.Good, key: '3', tone: 'good', label: 'Bom' },
  { grade: Rating.Easy, key: '4', tone: 'easy', label: 'Fácil' },
] as const

function discardRecording(recorder: MediaRecorder) {
  recorder.onstop = null
  recorder.ondataavailable = null
  if (recorder.state !== 'inactive') recorder.stop()
  recorder.stream.getTracks().forEach((track) => track.stop())
}

export default function ReviewPanel({ initialCards, mode = 'default', workspaceId, noteId }: ReviewPanelProps) {
  const { settings } = useSettings()
  const { isOnline, pendingCount, isSyncing, syncStatusMessage, refreshPendingCount, syncPendingReviews } = useOfflineSync()
  const [cards, setCards] = useState<ReviewCard[]>(initialCards)

  // Efeito para salvar initialCards no cache offline quando online, ou recuperar se offline
  useEffect(() => {
    let active = true
    async function initOfflineCards() {
      if (navigator.onLine) {
        if (initialCards.length > 0) await saveCardsToCache(initialCards)
        return
      }

      if (initialCards.length > 0) return
      const cached = await getCachedCards()
      if (!active) return

      const filtered = (cached ?? []).filter((card) => {
        if (noteId && card.notes?.id !== noteId) return false
        return !workspaceId || card.notes?.workspace_id === workspaceId
      })
      if (filtered.length > 0) setCards(filtered)
    }
    void initOfflineCards().catch(() => {})
    return () => { active = false }
  }, [initialCards, noteId, workspaceId])

  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showContext, setShowContext] = useState(false)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [openAccordion, setOpenAccordion] = useState<'analogia' | 'mnemonico' | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [responseMethod, setResponseMethod] = useState<'voice' | 'text' | null>(null)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [aiFeedback, setAiFeedback] = useState<{ correct: boolean; feedback: string } | null>(null)
  const [userAnswerText, setUserAnswerText] = useState('')
  
  // NOVOS ESTADOS PARA O VÍDEO
  const [showVideoModal, setShowVideoModal] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [isSearchingVideo, setIsSearchingVideo] = useState(false)
  
  const [uiError, setUiError] = useState<string | null>(null)
  const showError = (msg: string) => {
    setUiError(msg)
    setTimeout(() => setUiError(null), 5000)
  }

  const isUsingAdvancedSpeech = settings?.transcription_mode === 'whisper'
  const recognitionRef = useRef<any>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const acceptsRecording = useRef(false)
  const audioChunksRef = useRef<Blob[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const contextModalRef = useRef<HTMLDivElement>(null)

  const [isJeopardy, setIsJeopardy] = useState(false)
  const [potentialStreak, setPotentialStreak] = useState(0)
  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0)
  const [rescueSuccess, setRescueSuccess] = useState(false)

  // Estado para alerta de reaprendizagem
  const [noteAlerts, setNoteAlerts] = useState<
    Record<string, { shouldAlert: boolean; lapsedPercentage: number; cardsWithLapses: number; totalCards: number }>
  >({})
  const checkedNotesRef = useRef<Set<string>>(new Set())

  const [sessionStats, setSessionStats] = useState({ correct: 0, wrong: 0, hard: 0 })

  // ESTADOS DO MODO SIMULADO
  const [isSimuladoMode, setIsSimuladoMode] = useState(mode === 'ultimato')
  const [quizOptions, setQuizOptions] = useState<string[]>([])
  const [selectedQuizOption, setSelectedQuizOption] = useState<string | null>(null)
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false)

  // ESTADO DO TIMER DE LEITURA OBRIGATÓRIA (MODO ULTIMATO)
  const [ultimatumTimer, setUltimatumTimer] = useState(0)

  // 🟢 ESTADOS DO COMBO DE PRECISÃO ("PEGADA DO MESTRE")
  const [comboCount, setComboCount] = useState(0)

  useEffect(() => {
    if (ultimatumTimer > 0) {
      const timer = setTimeout(() => {
        setUltimatumTimer(prev => prev - 1)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [ultimatumTimer])
  
  // ESTADOS DO MODO BATALHA (BOSS FIGHT)
  const [isBossMode, setIsBossMode] = useState(false)
  const [bossHp, setBossHp] = useState(5)
  const [playerHp, setPlayerHp] = useState(5)
  const [maxBossHp, setMaxBossHp] = useState(5)
  const [isBossDefeated, setIsBossDefeated] = useState(false)
  const [isPlayerDefeated, setIsPlayerDefeated] = useState(false)
  const [combatFeedback, setCombatFeedback] = useState<'hit' | 'miss' | null>(null)
  
  const [isTtsLoading, setIsTtsLoading] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  // Áudio de Batalha
  const [isMusicEnabled, setIsMusicEnabled] = useState(true)
  const [currentBattleTrack, setCurrentBattleTrack] = useState('/sounds/battle.mp3')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // 🟢 ESTADOS E REFS DOS NOVOS MODOS DE ESTUDO (SOBREVIVÊNCIA & ZEN)
  const [isCrammingMode, setIsCrammingMode] = useState(false)
  const [isZenMode, setIsZenMode] = useState(false)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const noiseNodeRef = useRef<AudioBufferSourceNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedCramming = localStorage.getItem('omnimind_cramming_mode') === 'true'
      const savedZen = localStorage.getItem('omnimind_zen_mode') === 'true'
      setIsCrammingMode(savedCramming)
      setIsZenMode(savedZen)
    }
  }, [])

  const startZenNoise = useCallback(() => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      const ctx = new AudioContextClass()
      audioCtxRef.current = ctx

      const bufferSize = 2 * ctx.sampleRate
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const output = noiseBuffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1
      }

      const whiteNoise = ctx.createBufferSource()
      whiteNoise.buffer = noiseBuffer
      whiteNoise.loop = true

      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(350, ctx.currentTime) // Som de chuva macio

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.10, ctx.currentTime) // Volume de fundo suave

      whiteNoise.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)

      whiteNoise.start()
      noiseNodeRef.current = whiteNoise
      gainNodeRef.current = gain
    } catch (e) {
      console.warn('Web Audio rain generator error', e)
    }
  }, [])

  const stopZenNoise = useCallback(() => {
    if (noiseNodeRef.current) {
      try {
        noiseNodeRef.current.stop()
      } catch (e) {}
      noiseNodeRef.current = null
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close()
      } catch (e) {}
      audioCtxRef.current = null
    }
  }, [])

  useEffect(() => {
    if (isZenMode) {
      startZenNoise()
    } else {
      stopZenNoise()
    }
    return () => stopZenNoise()
  }, [isZenMode, startZenNoise, stopZenNoise])

  const toggleCrammingMode = () => {
    const newState = !isCrammingMode
    setIsCrammingMode(newState)
    localStorage.setItem('omnimind_cramming_mode', String(newState))
    if (newState) {
      setIsBossMode(false)
      setIsSimuladoMode(false)
    }
  }

  const toggleZenMode = () => {
    const newState = !isZenMode
    setIsZenMode(newState)
    localStorage.setItem('omnimind_zen_mode', String(newState))
  }

  const activeCard = cards[currentIndex]
  const canReveal = !isFlipped && !responseMethod && !isSimuladoMode && !isEvaluating
  const canRateEasy = !isSubmitting && (aiFeedback === null || aiFeedback.correct)
  
  // Variáveis computadas para o Boss Mode
  const isEnrageMode = isBossMode && bossHp === 1
  const isCriticalDanger = isBossMode && playerHp === 1

  // --- Inicialização do reconhecimento de voz ---
  useEffect(() => {
    // Cacheamento e Inicialização imediata do motor de síntese de voz (reduz delay de partida do TTS)
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices()
      const handleVoicesChanged = () => {
        window.speechSynthesis.getVoices()
      }
      window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged)
      return () => {
        window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition()
        recognition.continuous = false
        recognition.interimResults = true
        recognition.lang = 'pt-BR'

        recognition.onresult = (event: any) => {
          let currentTranscript = ''
          for (let i = event.resultIndex; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript
          }
          setUserAnswerText(currentTranscript)
        }

        recognition.onerror = (event: any) => {
          console.error('Erro no reconhecimento de voz', event.error)
          setIsRecording(false)
        }

        recognition.onend = () => setIsRecording(false)
        
        recognitionRef.current = recognition
        return () => {
          recognition.onresult = null
          recognition.onerror = null
          recognition.onend = null
          recognition.abort()
          recognitionRef.current = null
        }
      }
    }
  }, [])

  useEffect(() => {
    acceptsRecording.current = true
    return () => {
      acceptsRecording.current = false
      if (mediaRecorderRef.current) discardRecording(mediaRecorderRef.current)
    }
  }, [])

  // Efeito da Música de Batalha
  useEffect(() => {
    if (audioRef.current) {
      if (isBossMode && isMusicEnabled) {
        audioRef.current.volume = 0.3
        // Força recarga da faixa de áudio se ela mudar
        audioRef.current.load()
        audioRef.current.play().catch(() => {
          console.warn('Autoplay da música bloqueado pelo navegador.')
        })
      } else {
        audioRef.current.pause()
      }
    }
  }, [isBossMode, isMusicEnabled, currentBattleTrack])

  // Cleanup na desmontagem
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [userAnswerText, responseMethod])

  // --- Busca status de Jeopardy da Streak ---
  const playMKSFX = useCallback((type: 'fight' | 'finish-him' | 'flawless' | 'fatality' | 'yousuck') => {
    if (isCrammingMode) return // Sem barulho no Cramming!
    if (!settings.enable_sounds) return
    const urls = {
      'fight': '/sounds/mk/fight.mp3',
      'finish-him': '/sounds/mk/finish-him.mp3',
      'flawless': '/sounds/mk/flawless.mp3',
      'fatality': '/sounds/mk/fatality.mp3',
      'yousuck': '/sounds/mk/yousuck.mp3'
    }
    const audio = new Audio(urls[type])
    audio.volume = 0.6
    audio.play().catch(e => console.warn('SFX block', e))
  }, [settings.enable_sounds])

  useEffect(() => {
    getStreakJeopardyStatus().then((res) => {
      if (res && res.isJeopardy) {
        setIsJeopardy(true)
        setPotentialStreak(res.potentialStreak)
      }
    })
  }, [])

  const [hasLoggedFinishMilestone, setHasLoggedFinishMilestone] = useState(false)

  useEffect(() => {
    if (!activeCard && cards.length > 0 && !hasLoggedFinishMilestone) {
      setHasLoggedFinishMilestone(true)
      const runFinishMilestone = async () => {
        const { addMilestone } = await import('@/actions/milestones')
        const topicName = cards[0]?.notes?.title || 'Estudos'
        if (sessionStats.wrong === 0 && sessionStats.correct > 0) {
          await addMilestone(`Você sobreviveu à ofensiva em ${topicName} e completou a revisão com 100% de acertos! ⚔️`, 'perfect_review')
        } else if (sessionStats.correct > 0) {
          await addMilestone(`Você finalizou a campanha de estudos de hoje em ${topicName}.`, 'session_complete')
        }
      }
      runFinishMilestone().catch(console.error)
    }
  }, [activeCard, cards, sessionStats, hasLoggedFinishMilestone])

  // --- Verificação de alerta de reaprendizagem ---
  useEffect(() => {
    if (!activeCard) return
    const noteId = activeCard.notes.id

    if (checkedNotesRef.current.has(noteId) || noteAlerts[noteId]) return

    const checkAlert = async () => {
      try {
        const result = await checkNoteRelearningAlert(noteId)
        setNoteAlerts(prev => ({
          ...prev,
          [noteId]: result as {
            shouldAlert: boolean
            lapsedPercentage: number
            cardsWithLapses: number
            totalCards: number
          },
        }))
        checkedNotesRef.current.add(noteId)
      } catch (error) {
        console.error('Erro ao verificar alerta de reaprendizagem:', error)
        checkedNotesRef.current.add(noteId)
      }
    }

    checkAlert()
  }, [activeCard, noteAlerts])

  // --- Carregar opções do simulado ---
  useEffect(() => {
    if (!activeCard || !isSimuladoMode) return

    const loadQuizOptions = async () => {
      setIsGeneratingQuiz(true)
      try {
        const result = await generateDistractorsWithGroq(activeCard.front, activeCard.back)
        const allOptions = [result.correct, ...result.distractors]
        // Fisher-Yates shuffle
        for (let i = allOptions.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [allOptions[i], allOptions[j]] = [allOptions[j], allOptions[i]];
        }
        setQuizOptions(allOptions)
      } catch (err) {
        console.error('Erro ao gerar alternativas de quiz:', err)
        const fallback = [
          activeCard.back,
          'Alternativa incorreta A (erro de conexão)',
          'Alternativa incorreta B (erro de conexão)',
          'Alternativa incorreta C (erro de conexão)'
        ]
        setQuizOptions(fallback)
      } finally {
        setIsGeneratingQuiz(false)
      }
    }

    loadQuizOptions()
  }, [currentIndex, isSimuladoMode, activeCard])

  // --- Scroll e Highlight automático (Híbrido: MD5 + Busca Textual Infalível) ---
  useEffect(() => {
    if (showContext && activeCard?.source_anchor && contextModalRef.current) {
      const timer = setTimeout(() => {
        if (!contextModalRef.current) return
        
        const blockElements = contextModalRef.current.querySelectorAll(
          'p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th'
        )
        let targetElement: Element | null = null

        // TENTATIVA 1: Encontrar por Hash
        for (const el of blockElements) {
          const textContent = el.textContent?.trim() || ''
          if (textContent.length > 5) {
            const cleanText = textContent.replace(/\s+/g, ' ').trim()
            const hash = md5(cleanText).toString()
            
            if (hash === activeCard.source_anchor) {
              targetElement = el
              break
            }
          }
        }

        // TENTATIVA 2 (FALLBACK): Encontrar pela RESPOSTA
        if (!targetElement) {
          const fallbackSearchText = activeCard.back.substring(0, 40).trim();
          for (const el of blockElements) {
            const textContent = el.textContent?.trim() || ''
            if (textContent.length > 5 && textContent.includes(fallbackSearchText)) {
              targetElement = el
              break
            }
          }
        }

        if (targetElement) {
          const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
          targetElement.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'center' })
          targetElement.classList.add('bg-primary/10', 'ring-1', 'ring-primary/50', 'rounded-lg', 'transition-all', 'duration-300')
          setTimeout(() => {
            targetElement.classList.remove('bg-primary/10', 'ring-1', 'ring-primary/50', 'rounded-lg')
          }, 3500)
        } else {
          console.warn("⚠️ OmniMind: Não foi possível encontrar o trecho exato da nota para destacar.")
        }
      }, 700)

      return () => clearTimeout(timer)
    }
  }, [showContext, activeCard])

  // --- Handlers de swipe (toque) ---
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return

    const deltaX = e.changedTouches[0].clientX - touchStartX.current
    const deltaY = e.changedTouches[0].clientY - touchStartY.current

    if (!isSimuladoMode && !responseMethod && !isEvaluating && Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      setIsFlipped(prev => !prev)
    }

    touchStartX.current = null
    touchStartY.current = null
  }

  // --- Função para estimar intervalo futuro ---
  const getIntervalLabel = (rating: Rating): string => {
    const { stability, scheduled_days } = activeCard
    let factor = 1
    switch (rating) {
      case Rating.Again: factor = 0.2; break
      case Rating.Hard: factor = 0.6; break
      case Rating.Good: factor = 1.0; break
      case Rating.Easy: factor = 1.8; break
    }
    const base = stability || scheduled_days || 1
    const newInterval = Math.round(base * factor)
    if (newInterval < 1) return '< 1d'
    if (newInterval === 1) return '1d'
    return `${newInterval}d`
  }

  // --- 🆕 FUNÇÃO: Text-to-Speech (Gratuito e Offline) ---
  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) {
      showError('Seu navegador não suporta leitura de voz.');
      return;
    }

    if (isSpeaking || isTtsLoading) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setIsTtsLoading(false);
      return;
    }

    // Cancela qualquer fala residual e ativa indicador de carregamento
    window.speechSynthesis.cancel();
    setIsTtsLoading(true);
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 0.9;
    utterance.pitch = 1.2;

    const selectedVoice = getBestVoice(settings.tts_voice)
    if (selectedVoice) {
      utterance.voice = selectedVoice
    }

    utterance.onstart = () => {
      setIsTtsLoading(false);
      setIsSpeaking(true);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      setIsTtsLoading(false);
    };

    utterance.onerror = (err) => {
      console.error('TTS Error:', err);
      setIsSpeaking(false);
      setIsTtsLoading(false);
    };

    window.speechSynthesis.speak(utterance);
  };

    // --- 🆕 FUNÇÃO: Buscar Vídeo Explicativo no YouTube ---
    const handleSearchVideo = async () => {
    if (isSearchingVideo || !activeCard) return;
    setIsSearchingVideo(true);
    try {
      let searchTerms = activeCard.front
        .replace(/[?]/g, '')
        .replace(/^(O que|Qual|Quais|Como|Quando|Onde|Por que|O que é|Quem|Para que) /i, '')
        .trim();
      
      const query = `${searchTerms} aula resumo`; 
      const result = await searchYoutubeExplanation(query);
      
      // Verifica se houve um erro de comunicação/API
      if (!result.success) {
        showError('Ops! A API do YouTube retornou um erro: ' + (result.error || 'Erro desconhecido.'));
        return;
      }

      // Verifica se não encontrou nenhum vídeo
      if (!result.videos || result.videos.length === 0) {
        showError('Não encontramos nenhum vídeo explicativo específico para este tópico no YouTube. Tente buscar por termos mais gerais.');
        return;
      }

      // Se passou por tudo, exibe o primeiro vídeo!
      const videoId = result.videos[0].id.videoId;
      setVideoUrl(`https://www.youtube.com/embed/${videoId}`);
      setShowVideoModal(true);

    } catch (error) {
      console.error('Erro crítico ao buscar vídeo:', error);
      showError('Houve um erro inesperado ao tentar buscar o vídeo.');
    } finally {
      setIsSearchingVideo(false);
    }
  }

  // --- Funções de gravação avançada (Groq Whisper) ---
  const startAdvancedRecording = async () => {
    let stream: MediaStream | undefined
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!acceptsRecording.current) {
        audioStream.getTracks().forEach((track) => track.stop())
        return
      }
      stream = audioStream
      
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
        audioStream.getTracks().forEach(track => track.stop())
        
        setIsEvaluating(true)
        try {
          const formData = new FormData()
          formData.append('file', audioBlob, 'audio.webm')
          const apiRes = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData,
          })
          const resData = await apiRes.json()
          if (!apiRes.ok || resData.error) {
            if (apiRes.status === 429 || resData.error?.includes('sobrecarregado')) {
               showError('Muitas requisições. Aguarde alguns segundos e tente novamente.');
            } else {
               showError(`Erro ao transcrever com Groq Whisper: ${resData.error || 'Erro na requisição'}`)
            }
            return
          } else {
            setUserAnswerText(resData.text)
          }
        } catch (err: any) {
          console.error(err)
          showError('Erro ao se conectar ao Groq Whisper.')
          setUserAnswerText('')
          setResponseMethod(null)
        } finally {
          setIsEvaluating(false)
          setIsRecording(false)
        }
      }

      mediaRecorder.start()
      setIsRecording(true)
      setResponseMethod('voice')
      setUserAnswerText('Gravando áudio... Fale agora.')
    } catch (err) {
      stream?.getTracks().forEach((track) => track.stop())
      console.error('Erro ao acessar microfone:', err)
      showError('Não foi possível acessar seu microfone. Verifique as permissões de áudio no seu navegador.')
      setIsRecording(false)
    }
  }

  const stopAdvancedRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }

  const handleCancelRecording = () => {
    if (isRecording) {
      const recorder = mediaRecorderRef.current
      if (isUsingAdvancedSpeech && recorder) {
        discardRecording(recorder)
      } else {
        recognitionRef.current?.abort()
      }
      setIsRecording(false)
    }
    setResponseMethod(null)
    setUserAnswerText('')
  }

  // --- Funções principais ---
  const toggleRecording = () => {
    if (isUsingAdvancedSpeech) {
      if (isRecording) {
        stopAdvancedRecording()
      } else {
        startAdvancedRecording()
      }
      return
    }

    const recognition = recognitionRef.current
    if (!recognition) {
      showError('Seu navegador não suporta reconhecimento de voz nativo.')
      return
    }

    if (isRecording) {
      recognition.stop()
      setIsRecording(false)
    } else {
      setUserAnswerText('')
      setResponseMethod('voice')
      try {
        recognition.start()
        setIsRecording(true)
      } catch {
        setResponseMethod(null)
        showError('Não foi possível iniciar a gravação.')
      }
    }
  }

  const handleEvaluateWithAI = async () => {
    if (!userAnswerText.trim() || !activeCard) return
    setIsEvaluating(true)
    try {
      const result = await evaluateAnswerWithGroq(
        activeCard.front,
        activeCard.back,
        userAnswerText
      )
      setAiFeedback(result)
      setIsFlipped(true)
    } catch (error) {
      console.error('Erro ao avaliar com IA:', error)
      showError('Não foi possível se comunicar com o tutor de IA. Compare com a resposta oficial.')
      setIsFlipped(true)
    } finally {
      setIsEvaluating(false)
    }
  }

  const handleSelectQuizOption = (option: string) => {
    if (selectedQuizOption) return // Já respondeu
    setSelectedQuizOption(option)
    
    const isCorrect = option === activeCard.back

    if (mode === 'ultimato') {
      if (isCorrect) {
        if (settings.enable_sounds) {
          playEvaluationSound(true)
        }
        setAiFeedback({
          correct: true,
          feedback: 'Parabéns! Alternativa correta.'
        })
        addXp(XP_CONFIG.PERFECT_SIMULADO).catch(console.error)
        
        // Avanço automático após 1 segundo no acerto
        setTimeout(() => {
          handleReview(Rating.Good)
        }, 1000)
      } else {
        if (settings.enable_sounds) {
          playEvaluationSound(false)
        }
        setAiFeedback({
          correct: false,
          feedback: `Alternativa incorreta. A resposta correta é: "${activeCard.back}".`
        })
        setIsFlipped(true)
        setUltimatumTimer(3) // Bloqueia avanço por 3 segundos
      }
      return
    }

    if (isCorrect) {
      if (settings.enable_sounds) {
        playEvaluationSound(true)
      }
      setAiFeedback({
        correct: true,
        feedback: 'Parabéns! Você escolheu a alternativa correta.'
      })
      addXp(XP_CONFIG.PERFECT_SIMULADO).catch(console.error)
      
      if (isBossMode) {
        setCombatFeedback('hit')
        setTimeout(() => setCombatFeedback(null), 800)
        
        const newHp = bossHp - 1
        setBossHp(newHp)
        if (newHp <= 0 && !isBossDefeated) {
          setIsBossDefeated(true)
          
          if (playerHp === maxBossHp) playMKSFX('flawless')
          else playMKSFX('fatality')

          // Usa o front do card como contexto pro nome do boss
          grantBossVictory(activeCard.front.substring(0, 50))
            .then((res) => {
              if (res && res.newlyUnlocked && Array.isArray(res.newlyUnlocked)) {
                res.newlyUnlocked.forEach((achievement: any) => {
                  window.dispatchEvent(new CustomEvent('achievement-unlocked', {
                    detail: achievement
                  }))
                })
              }
            })
            .catch(console.error)
        } else if (newHp === 1) {
          playMKSFX('finish-him')
        }
      }
    } else {
      if (settings.enable_sounds) {
        playEvaluationSound(false)
      }
      setAiFeedback({
        correct: false,
        feedback: `Você escolheu a alternativa incorreta. A resposta correta é: "${activeCard.back}".`
      })
      
      if (isBossMode) {
        setCombatFeedback('miss')
        setTimeout(() => setCombatFeedback(null), 800)
        
        // No Enrage Mode (1 HP do Boss), o erro custa 2 vidas!
        const damage = isEnrageMode ? 2 : 1
        const newHp = playerHp - damage
        setPlayerHp(Math.max(0, newHp))
        if (newHp <= 0) {
          setIsPlayerDefeated(true)
          playMKSFX('yousuck')
        }
      }
    }
    setIsFlipped(true)
  }

  const handleReview = async (grade: Rating) => {
    // Feedback tátil (vibração de 10ms no mobile)
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10)
    }

    if (settings.enable_sounds) {
      playButtonClick(grade)
    }

    // Para qualquer leitura de voz em andamento ao avançar o card
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setIsTtsLoading(false);
    }

    // Lógica do Combo de Precisão ("Pegada do Mestre")
    const isCorrect = grade === Rating.Good || grade === Rating.Easy
    const newCombo = isCorrect ? comboCount + 1 : 0
    setComboCount(newCombo)

    // Se o usuário alcançou o combo mestre (>= 10), ativa glow do Golem no Dashboard
    if (newCombo >= 10 && typeof window !== 'undefined') {
      localStorage.setItem('omnimind_mastery_combo_glow', 'true')
    }

    // Desafio de Resgate de Streak
    if (isJeopardy && !rescueSuccess) {
      if (grade === Rating.Good || grade === Rating.Easy) {
        const nextCorrect = consecutiveCorrect + 1
        setConsecutiveCorrect(nextCorrect)
        if (nextCorrect >= 2) {
          setRescueSuccess(true)
          rescueStreak().then((res) => {
            if (res.success) {
              window.dispatchEvent(new CustomEvent('achievement-unlocked', {
                detail: {
                  id: 'rescue_success',
                  title: '⚡ Sequência Resgatada!',
                  description: `Você acertou 2 cards consecutivos e salvou sua streak de ${potentialStreak + 1} dias!`
                }
              }))
            } else {
              showError(`Erro ao resgatar streak: ${res.error}`)
            }
          })
        }
      } else {
        setConsecutiveCorrect(0)
      }
    }

    // 1. Atualiza estatísticas locais da sessão de forma instantânea
    if (grade === Rating.Good || grade === Rating.Easy) {
      setSessionStats(prev => ({ ...prev, correct: prev.correct + 1 }))
    } else if (grade === Rating.Again) {
      setSessionStats(prev => ({ ...prev, wrong: prev.wrong + 1 }))
    } else if (grade === Rating.Hard) {
      setSessionStats(prev => ({ ...prev, hard: prev.hard + 1 }))
    }

    // 2. Reseta estados visuais de resposta e avança para o próximo card instantaneamente
    setIsFlipped(false)
    setOpenAccordion(null)
    setIsConfirmingDelete(false)
    setResponseMethod(null)
    setAiFeedback(null)
    setUserAnswerText('')
    setSelectedQuizOption(null)
    setQuizOptions([])

    // Se for Modo Sobrevivência (Véspera de Prova) e errou/teve dificuldade, põe no fim da fila
    if (isCrammingMode && (grade === Rating.Again || grade === Rating.Hard)) {
      setCards(prev => [...prev, activeCard])
    }

    setCurrentIndex(prev => prev + 1)

    // 3. Salva a revisão no banco em background (ou na fila offline se falhar ou estiver offline)
    if (typeof window !== 'undefined' && !navigator.onLine) {
      savePendingReview({
        cardId: activeCard.id,
        currentFsrsState: activeCard,
        grade,
      }).then(() => refreshPendingCount())
    } else {
      submitReview(activeCard.id, activeCard, grade, newCombo)
        .then((res) => {
          if (isCrammingMode) return // Sem barulho ou toasts de conquistas no Cramming!

          // Dispara conquistas em background se houver alguma desbloqueada
          if (res && 'newlyUnlocked' in res && Array.isArray(res.newlyUnlocked)) {
            res.newlyUnlocked.forEach((achievement: any) => {
              window.dispatchEvent(new CustomEvent('achievement-unlocked', {
                detail: achievement
              }))
            })
          }
          // Dispara subida de nível em background
          if (res && res.leveledUp) {
            window.dispatchEvent(new CustomEvent('level-up', {
              detail: { oldLevel: res.leveledUp.oldLevel, newLevel: res.leveledUp.newLevel }
            }))
          }
          // Dispara subida de nível de domínio (Maestria) do workspace
          if (res && res.masteryLevelUp) {
            window.dispatchEvent(new CustomEvent('achievement-unlocked', {
              detail: {
                id: `mastery_${res.masteryLevelUp.workspaceName}`,
                title: res.masteryLevelUp.newLevel === 10 ? '👑 Patriarca da Matéria!' : '🏆 Domínio Evoluiu!',
                description: res.masteryLevelUp.newLevel === 10 
                  ? `Você se tornou o Patriarca de ${res.masteryLevelUp.workspaceName}!`
                  : `Seu domínio em ${res.masteryLevelUp.workspaceName} subiu para o Nível ${res.masteryLevelUp.newLevel}!`
              }
            }))
          }
        })
        .catch((error) => {
          console.error('Erro ao salvar revisão em background (salvando offline):', error)
          savePendingReview({
            cardId: activeCard.id,
            currentFsrsState: activeCard,
            grade,
          }).then(() => refreshPendingCount())
        })
    }
  }

  const handleDeleteCard = async () => {
    setIsSubmitting(true)
    try {
      const res = await deleteFlashcard(activeCard.id)
      if (res?.error) throw new Error(res.error)

      const updatedCards = cards.filter(c => c.id !== activeCard.id)
      setCards(updatedCards)

      if (currentIndex >= updatedCards.length) {
        setCurrentIndex(Math.max(0, updatedCards.length - 1))
      }

      setIsFlipped(false)
      setOpenAccordion(null)
      setIsConfirmingDelete(false)
      setResponseMethod(null)
      setAiFeedback(null)
      setUserAnswerText('')
      setSelectedQuizOption(null)
      setQuizOptions([])
    } catch (error) {
      console.error('Erro ao deletar card:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleAccordion = (section: 'analogia' | 'mnemonico') => {
    setOpenAccordion(prev => (prev === section ? null : section))
  }

  // --- Atalhos de teclado ---
  const onReviewShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    if (event.key === 'Escape') {
      if (showVideoModal) {
        setShowVideoModal(false)
        setVideoUrl('')
      } else if (showContext) {
        setShowContext(false)
      } else if (isZenMode) {
        toggleZenMode()
      }
      return
    }
    if (!activeCard || showContext || showVideoModal || isSubmitting || isEvaluating || isConfirmingDelete || isBossDefeated || isPlayerDefeated) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('input, textarea, select, [contenteditable]')) return

    if (canReveal && (event.key === ' ' || event.key === 'Enter')) {
      if (target?.closest('a, button, summary')) return
      event.preventDefault()
      setIsFlipped(true)
    }

    if (!isFlipped) return
    const grade = reviewRatings.find((item) => item.key === event.key)?.grade
    if (!grade || (grade === Rating.Easy && !canRateEasy)) return
    if (mode === 'ultimato' && (grade !== Rating.Again || ultimatumTimer > 0)) return
    event.preventDefault()
    void handleReview(grade)
  })

  useEffect(() => {
    const listen = (event: KeyboardEvent) => onReviewShortcut(event)
    window.addEventListener('keydown', listen)
    return () => window.removeEventListener('keydown', listen)
  }, [])

  // --- Renderização final ---
  if (!activeCard) {
    const hasReviewed = sessionStats.correct + sessionStats.hard + sessionStats.wrong > 0

    return (
      <>
        <div className="mt-3">
          <OfflineBanner
            isOnline={isOnline}
            pendingCount={pendingCount}
            isSyncing={isSyncing}
            syncStatusMessage={syncStatusMessage}
            onManualSync={syncPendingReviews}
          />
        </div>
        <section className="rv-panel rv-summary" aria-labelledby="resumo-revisao">
          <div>
            <h2 id="resumo-revisao">{hasReviewed ? 'Sessão concluída' : mode === 'ultimato' ? 'Sem cards para o Ultimato' : 'Tudo em dia'}</h2>
            <p>{hasReviewed
              ? 'Confira como você avaliou suas respostas nesta sessão.'
              : mode === 'ultimato'
                ? 'A fila dos próximos 15 dias está vazia para esta sessão.'
                : 'Não há flashcards pendentes neste foco no momento.'}</p>
            {hasReviewed && (
              <dl className="rv-row gap-x-5">
                <div><dt>Bom ou fácil</dt><dd className="rv-green">{sessionStats.correct}</dd></div>
                <div><dt>Difícil</dt><dd className="rv-orange">{sessionStats.hard}</dd></div>
                <div><dt>Errei</dt><dd>{sessionStats.wrong}</dd></div>
              </dl>
            )}
            <Link className="rv-button rv-primary" href="/dashboard/revisoes">Escolher outro foco <ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
          <Image className="rv-summary-art" src="/images/empty_state_astronaut.png" width={230} height={230} alt="" />
        </section>
      </>
    )
  }

  // === RENDERIZAÇÃO DA VITÓRIA / DERROTA NO BOSS ===
  if (isBossMode && isBossDefeated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] p-8 text-center animate-in zoom-in duration-500">
        <div className="text-8xl mb-6 drop-shadow-xl animate-bounce">🏆</div>
        <h2 className="text-3xl sm:text-4xl font-black text-text-strong tracking-tighter mb-4 text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-primary">
          Boss Derrotado!
        </h2>
        <p className="text-text-muted mb-8 max-w-md mx-auto">
          Você massacrou o simulado e ganhou 50 XP extras, além de desbloquear um novo título gerado pela IA! 
          (Confira seu Perfil).
        </p>
        <button 
          onClick={() => {
            setIsBossMode(false)
            setIsSimuladoMode(false)
            setIsBossDefeated(false)
            handleReview(3) // Passa pro prox
          }}
          className="bg-primary text-white font-bold px-8 py-3 rounded-xl hover:bg-primary-hover hover:scale-105 transition-all shadow-lg"
        >
          Continuar Jornada
        </button>
      </div>
    )
  }

  if (isBossMode && isPlayerDefeated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] p-8 text-center animate-in zoom-in duration-500">
        <div className="text-8xl mb-6 drop-shadow-xl grayscale">💀</div>
        <h2 className="text-3xl font-black text-red-500 tracking-tighter mb-4">
          Você foi Destruído
        </h2>
        <p className="text-text-muted mb-8 max-w-md mx-auto">
          A dificuldade deste assunto superou suas habilidades... por enquanto. Levante-se e tente novamente!
        </p>
        <button 
          onClick={() => {
            setIsBossMode(false)
            setIsSimuladoMode(false)
            setIsPlayerDefeated(false)
            handleReview(1) // Marca como Errou (Hard)
          }}
          className="bg-surface-muted text-text-strong font-bold px-8 py-3 rounded-xl hover:bg-border transition-all shadow-sm"
        >
          Aceitar a Derrota
        </button>
      </div>
    )
  }

  return (
    <div className={'rv-stage' + (isZenMode ? ' rv-zen' : '')}>
      {/* Banner de Status Offline & Sincronização */}
      <OfflineBanner
        isOnline={isOnline}
        pendingCount={pendingCount}
        isSyncing={isSyncing}
        syncStatusMessage={syncStatusMessage}
        onManualSync={syncPendingReviews}
      />
      {/* Botão de Fechar do Modo Zen */}
      {isZenMode && (
        <button
          onClick={toggleZenMode}
          className="rv-button rv-exit"
          title="Sair do Modo Imersão"
        >
          <X className="size-4" aria-hidden="true" /> Sair da imersão
        </button>
      )}
      {/* Heartbeat Overlay */}
      {isCriticalDanger && (
        <div className="fixed inset-0 pointer-events-none z-50 animate-[pulse_1.5s_ease-in-out_infinite] shadow-[inset_0_0_150px_rgba(239,68,68,0.3)] border-[8px] border-red-500/10 mix-blend-multiply dark:mix-blend-screen" />
      )}

      {/* Alerta de Reaprendizagem */}
      {activeCard && noteAlerts[activeCard.notes.id]?.shouldAlert && (
        <div className="w-full mb-6">
          <RelearningAlert
            noteId={activeCard.notes.id}
            workspaceId={activeCard.notes.workspace_id}
            lapsedPercentage={noteAlerts[activeCard.notes.id].lapsedPercentage}
            cardsWithLapses={noteAlerts[activeCard.notes.id].cardsWithLapses}
            totalCards={noteAlerts[activeCard.notes.id].totalCards}
          />
        </div>
      )}

      {/* Banner de Resgate de Streak */}
      {isJeopardy && !rescueSuccess && (
        <div className="w-full mb-4 p-3 rounded-xl border border-orange-500/20 bg-orange-500/5 text-orange-500 text-xs font-semibold flex items-center justify-between gap-3 animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-1.5">
            <Flame className="size-4 animate-pulse fill-orange-500/10" />
            <span>Desafio de Resgate: Acerte 2 cards seguidos para salvar sua streak de {potentialStreak} dias!</span>
          </div>
          <span className="bg-orange-500/10 px-2 py-0.5 rounded-md font-mono">
            {consecutiveCorrect}/2 acertos
          </span>
        </div>
      )}

      {/* Barras de HP do Boss Mode */}
      {isBossMode && (
        <div className="w-full mb-6 flex items-center justify-between gap-4 bg-surface-muted/50 p-4 rounded-xl border border-red-500/20 relative">
          <div className="flex-1 relative">
            <div className="flex justify-between text-xs font-bold mb-1 text-green-500">
              <span>JOGADOR</span>
              <span>{playerHp}/{maxBossHp}</span>
            </div>
            <div className="h-3 bg-surface rounded-full overflow-hidden border border-border">
              <div className="h-full bg-green-500 transition-all duration-300" style={{ width: `${(playerHp / maxBossHp) * 100}%` }} />
            </div>
            {combatFeedback === 'miss' && (
              <div className="absolute right-0 top-0 text-red-500 font-black text-xl animate-float-up pointer-events-none drop-shadow-md">
                -{isEnrageMode ? '2' : '1'}
              </div>
            )}
          </div>
          
          <div className={`px-2 flex flex-col items-center justify-center transition-all ${isEnrageMode ? 'text-red-500 animate-pulse' : 'text-text-muted'}`}>
            <Ghost className={`size-8 ${isEnrageMode ? 'animate-bounce' : 'animate-[pulse_2s_ease-in-out_infinite]'}`} />
            
            {/* Music Toggle */}
            <button
              onClick={() => setIsMusicEnabled(!isMusicEnabled)}
              className="mt-1 p-1 rounded-full hover:bg-surface text-text-muted hover:text-text-strong transition-colors"
              title={isMusicEnabled ? "Desativar música épica" : "Ativar música épica"}
            >
              {isMusicEnabled ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
            </button>
            <audio ref={audioRef} src={currentBattleTrack} loop />
          </div>

          <div className="flex-1 relative">
            <div className="flex justify-between text-xs font-bold mb-1 text-red-500">
              <span>{activeCard.notes.title ? activeCard.notes.title.substring(0, 15) : 'BOSS'}</span>
              <span>{bossHp}/{maxBossHp}</span>
            </div>
            <div className="h-3 bg-surface rounded-full overflow-hidden border border-border flex justify-end">
              <div className="h-full bg-red-500 transition-all duration-300" style={{ width: `${(bossHp / maxBossHp) * 100}%` }} />
            </div>
            {combatFeedback === 'hit' && (
              <div className="absolute left-0 top-0 text-white font-black text-xl animate-float-up pointer-events-none drop-shadow-md">
                -1
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rv-panel rv-progress">
        <div className="rv-between">
          <p aria-live="polite">Cartão {currentIndex + 1} de {cards.length}</p>
          <span className="text-xs text-text-muted">{Math.round(currentIndex * 100 / cards.length)}% concluído</span>
        </div>
        <progress value={currentIndex} max={cards.length} aria-label="Progresso da sessão" />
      </div>

      {/* Barra superior: contador + ações */}
      <div className="rv-between text-sm font-medium">
        <div className="rv-row min-w-0">
          <span className="text-text-muted break-words min-w-0">{activeCard.notes?.title}</span>
          
          {/* Badge de Combo de Precisão */}
          {comboCount >= 5 && (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border animate-pulse select-none ${
              comboCount >= 10 
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                : 'bg-orange-500/10 text-orange-400 border-orange-500/20'
            }`}>
              {comboCount >= 10 ? <Zap className="size-3 text-amber-400 fill-amber-400/20 animate-bounce" /> : <Flame className="size-3 text-orange-400 fill-orange-400/20" />}
              <span>{comboCount >= 10 ? `Mestre x${comboCount}` : `Combo x${comboCount}`}</span>
            </span>
          )}
        </div>

        <div className="rv-row">
          {isConfirmingDelete ? (
            <div className="flex items-center gap-1 rounded-lg border border-error/30 bg-error-soft px-2 py-1 animate-in fade-in slide-in-from-right-2 duration-150">
              <AlertTriangle className="w-3.5 h-3.5 text-error shrink-0" />
              <span className="text-xs text-error font-medium mr-1">Excluir card?</span>
              <button onClick={handleDeleteCard} disabled={isSubmitting} className="text-xs font-semibold text-error hover:underline disabled:opacity-50 px-1">Confirmar</button>
              <span className="text-error/40 text-xs">·</span>
              <button onClick={() => setIsConfirmingDelete(false)} disabled={isSubmitting} className="text-xs font-medium text-text-muted hover:text-text-strong px-1">Cancelar</button>
            </div>
          ) : (
            <>
              <button
                onClick={() => setIsConfirmingDelete(true)}
                disabled={isSubmitting}
                className="rv-button rv-quiet"
                title="Excluir Flashcard"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <button
                onClick={() => setShowContext(true)}
                className="rv-button rv-quiet"
                title="Ver Contexto da Nota"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Ver Contexto</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Container com Glow do Combo de Precisão */}
      <div className="w-full flex-1 min-h-0 flex flex-col relative">
        {comboCount >= 5 && (
          <div className={`absolute -inset-1 rounded-[20px] opacity-35 blur-xl transition-all duration-500 animate-[pulse_3s_ease-in-out_infinite] pointer-events-none -z-10 ${
            comboCount >= 10
              ? 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 shadow-[0_0_35px_rgba(245,158,11,0.4)]'
              : 'bg-gradient-to-r from-orange-500 via-red-500 to-orange-600 shadow-[0_0_20px_rgba(249,115,22,0.25)]'
          }`} />
        )}

        {/* Painel principal do card */}
        <div
          className={`rv-panel rv-card
            ${isEnrageMode ? 'shadow-[0_0_20px_rgba(239,68,68,0.6)] border-red-500/50' : ''}
            ${combatFeedback === 'miss' ? 'animate-shake border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]' : ''}
            ${combatFeedback === 'hit' ? 'border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.4)]' : ''}
            ${comboCount >= 10 ? 'ring-2 ring-amber-500/80 border-amber-500/50' : comboCount >= 5 ? 'ring-2 ring-orange-500/60 border-orange-500/40' : ''}
          `}
          data-flipped={isFlipped}
          data-revealable={canReveal}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClick={() => canReveal && setIsFlipped(true)}
        >
        {isEvaluating ? (
          <div className="text-center flex flex-col h-full justify-center items-center my-auto animate-pulse">
            <BrainCircuit className="size-16 text-primary animate-bounce mb-4" />
            <p role="status" className="text-xl font-medium text-text-strong mb-2">
              {responseMethod === 'voice' && isRecording ? 'Transcrevendo sua resposta…' : 'Avaliando sua resposta…'}
            </p>
          </div>
        ) : !isFlipped ? (
          <div className="text-center flex flex-col flex-1 animate-in fade-in zoom-in-95 duration-200">
            <span className="rv-kicker mb-1">Pergunta</span>
            <h3 className="rv-flash-text">
              {activeCard.front}
            </h3>

            {isSimuladoMode ? (
              isGeneratingQuiz ? (
                <div className="flex flex-col items-center justify-center py-6 mt-4">
                  <Loader2 className="size-8 animate-spin text-primary mb-2" />
                  <p className="text-sm text-text-muted">Gerando simulado com IA...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 w-full mt-auto mb-4" onClick={e => e.stopPropagation()}>
                  {quizOptions.map((option, idx) => {
                    const letter = String.fromCharCode(65 + idx) // A, B, C, D
                    return (
                      <button
                        key={idx}
                        onClick={() => handleSelectQuizOption(option)}
                        className="w-full text-left p-4 rounded-xl border border-border bg-surface-muted/50 hover:bg-surface-hover hover:border-primary/40 transition-all flex items-start gap-3 pointer-events-auto"
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-surface border border-border text-xs font-bold text-text-muted">
                          {letter}
                        </span>
                        <span className="text-sm text-text-strong font-medium leading-tight">
                          {option}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            ) : responseMethod ? (
              <div 
                className="w-full mt-auto pt-6 border-t border-border shrink-0 animate-in fade-in slide-in-from-bottom-4 duration-200 text-left"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    aria-label="Sua resposta ao flashcard"
                    value={userAnswerText}
                    onChange={(e) => setUserAnswerText(e.target.value)}
                    placeholder={
                      responseMethod === 'voice'
                        ? isRecording ? 'Escutando você... Fale agora.' : 'Sua resposta falada apareceu aqui. Edite se necessário.'
                        : 'Digite sua resposta aqui...'
                    }
                    className="w-full min-h-[100px] p-4 bg-surface-muted border border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/50 rounded-2xl text-text-strong text-sm resize-none outline-none transition-all duration-200 custom-scrollbar overflow-hidden"
                    disabled={isRecording}
                  />
                  {responseMethod === 'voice' && isRecording && (
                    <div className="absolute right-4 top-4 flex items-center gap-1.5 bg-error-soft px-2 py-0.5 rounded-full border border-error/20">
                      <span className="size-2 bg-error rounded-full animate-ping" />
                      <span className="text-[10px] uppercase font-bold text-error">Gravando</span>
                    </div>
                  )}
                </div>
                <div className="rv-row rv-response">
                  {responseMethod === 'voice' && (
                    <button type="button" className="rv-button" onClick={toggleRecording}>
                      {isRecording ? <Square size={15} aria-hidden="true" /> : <Mic size={15} aria-hidden="true" />}
                      {isRecording ? 'Parar gravação' : 'Gravar novamente'}
                    </button>
                  )}
                  <button type="button" disabled={isRecording || !userAnswerText.trim()} className="rv-button rv-primary" onClick={handleEvaluateWithAI}>Avaliar com IA</button>
                  <button type="button" className="rv-button rv-quiet" onClick={handleCancelRecording}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="rv-row rv-reveal" onClick={(event) => event.stopPropagation()}>
                <button type="button" className="rv-button rv-primary" onClick={() => setIsFlipped(true)}>
                  <Eye size={17} aria-hidden="true" /> Revelar resposta
                </button>
                <button type="button" className="rv-button" onClick={() => setResponseMethod('text')}>
                  <Keyboard size={16} aria-hidden="true" /> Digitar
                </button>
                <button type="button" className="rv-button" onClick={toggleRecording}>
                  <Mic size={16} aria-hidden="true" /> Falar
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center animate-in fade-in zoom-in-95 duration-200 flex flex-col flex-1">
            {isSimuladoMode ? (
              <>
                <span className="rv-kicker mb-1">Pergunta</span>
                <h3 className="rv-flash-text">
                  {activeCard.front}
                </h3>
                <div className="grid grid-cols-1 gap-3 w-full mb-6 mt-auto animate-in fade-in duration-200" onClick={e => e.stopPropagation()}>
                  {quizOptions.map((option, idx) => {
                    const letter = String.fromCharCode(65 + idx)
                    const isCorrect = option === activeCard.back
                    const isSelected = option === selectedQuizOption
                    
                    let btnStyle = "border-border bg-surface-muted/30 opacity-75"
                    let letterStyle = "bg-surface border-border text-text-muted"
                    
                    if (isCorrect) {
                      btnStyle = "border-success/40 bg-success-soft/30 text-success font-semibold"
                      letterStyle = "bg-success text-white border-success"
                    } else if (isSelected && !isCorrect) {
                      btnStyle = "border-error/40 bg-error-soft/30 text-error font-semibold"
                      letterStyle = "bg-error text-white border-error"
                    }
                    
                    return (
                      <div
                        key={idx}
                        className={`w-full text-left p-4 rounded-xl border flex items-start gap-3 transition-all ${btnStyle}`}
                      >
                        <span className={`flex size-6 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ${letterStyle}`}>
                          {letter}
                        </span>
                        <span className="text-sm leading-tight">
                          {option}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : !aiFeedback ? (
              <>
                <span className="rv-kicker mb-3">Resposta do flashcard</span>
                <p className="rv-flash-text rv-answer-copy text-lg md:text-xl text-text-strong leading-relaxed mb-5">
                  {activeCard.back}
                </p>
              </>
            ) : (
              <span className="uppercase text-xs font-bold tracking-widest text-primary mb-6 block shrink-0">Revisão com Tutor AI</span>
            )}

            {/* Accordions de suporte cognitivo */}
            {(activeCard.analogia || activeCard.mnemonico) && (
              <div className="w-full flex flex-col gap-3 mt-auto mb-6 shrink-0">
                {activeCard.analogia && (
                  <div className="w-full bg-surface-muted border border-border rounded-xl overflow-hidden transition-all">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleAccordion('analogia') }}
                      className="w-full flex items-center justify-between p-4 text-left hover:bg-surface-hover transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Lightbulb className="w-4 h-4 text-warning" />
                        <span className="text-xs uppercase font-bold text-text-muted tracking-wider">Analogia (Feynman)</span>
                      </div>
                      {openAccordion === 'analogia' ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
                    </button>
                    {openAccordion === 'analogia' && (
                      <div className="p-4 pt-0 text-left animate-in slide-in-from-top-2 duration-200 border-t border-border/50">
                        <p className="text-text-medium text-sm leading-relaxed mt-3">{activeCard.analogia}</p>
                      </div>
                    )}
                  </div>
                )}

                {activeCard.mnemonico && (
                  <div className="w-full bg-surface-muted border border-border rounded-xl overflow-hidden transition-all">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleAccordion('mnemonico') }}
                      className="w-full flex items-center justify-between p-4 text-left hover:bg-surface-hover transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Brain className="w-4 h-4 text-primary" />
                        <span className="text-xs uppercase font-bold text-text-muted tracking-wider">Gatilho de Memória</span>
                      </div>
                      {openAccordion === 'mnemonico' ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
                    </button>
                    {openAccordion === 'mnemonico' && (
                      <div className="p-4 pt-0 text-left animate-in slide-in-from-top-2 duration-200 border-t border-border/50">
                        <div className="text-text-medium text-sm leading-relaxed mt-3 prose prose-sm prose-p:my-0 prose-strong:text-primary">
                          <ReactMarkdown>{activeCard.mnemonico}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Avaliação do Tutor AI */}
            {aiFeedback && (
              <div className="w-full mt-4 p-5 bg-surface-muted border border-border rounded-2xl text-left shrink-0 animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-primary" />
                    <span className="text-xs uppercase font-bold text-text-muted tracking-wider">Avaliação do Tutor AI</span>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                    aiFeedback.correct
                      ? 'bg-success-soft text-success border-success/20'
                      : 'bg-error-soft text-error border-error/20'
                  }`}>
                    {aiFeedback.correct ? 'Acertou! 🎉' : 'Errou / Parcial ✗'}
                  </span>
                </div>
                <p className="text-text-strong text-sm leading-relaxed mb-4">
                  {aiFeedback.feedback}
                </p>

                {/* 🆕 BOTÃO DE ASSISTIR VÍDEO (Apenas se errou) */}
                {!aiFeedback.correct && (
                  <div className="mb-4">
                    <button
                      onClick={handleSearchVideo}
                      disabled={isSearchingVideo}
                      className="w-full flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors"
                    >
                      {isSearchingVideo ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <PlayCircle className="size-4" />
                      )}
                      {isSearchingVideo ? 'Buscando vídeo...' : 'Assistir vídeo explicativo sobre este tópico'}
                    </button>
                  </div>
                )}

                {/* Grid comparativo responsivo */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border/50">
                  {userAnswerText && (
                    <div className="bg-surface/30 p-3.5 rounded-xl border border-border/50 flex flex-col justify-between" onClick={(e) => e.stopPropagation()}>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider mb-1 block">Sua Resposta:</span>
                        <p className="text-text-medium text-xs italic">“{userAnswerText}”</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowContext(true) }}
                        className="mt-3 text-[10px] text-primary hover:text-primary-hover font-semibold flex items-center gap-1 w-fit cursor-pointer"
                      >
                        <FileText className="size-3" />
                        Ver Contexto
                      </button>
                    </div>
                  )}

                  <div className="bg-primary-soft/10 p-3.5 rounded-xl border border-primary/10" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[10px] uppercase font-bold text-primary tracking-wider mb-1 block">Resposta Modelo:</span>
                    <p className="text-text-strong text-xs font-medium leading-relaxed">{activeCard.back}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Resposta do usuário sem avaliação de IA */}
            {!aiFeedback && userAnswerText && (
              <div className="w-full mt-4 p-5 bg-surface-muted border border-border rounded-xl text-left shrink-0">
                <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider mb-2 block">Sua Resposta:</span>
                <p className="text-text-strong text-sm italic">“{userAnswerText}”</p>
              </div>
            )}

            <button onClick={e => { e.stopPropagation(); setIsFlipped(false); setAiFeedback(null) }} className="rv-button rv-quiet mt-4 mx-auto w-fit shrink-0">
              <RotateCcw className="w-4 h-4" />
              Reler Pergunta
            </button>
          </div>
        )}
      </div>

      {/* Barra FSRS ou botões de resposta por Voz/Texto */}
      <div className="rv-controls">
        {/* Simulado e Áudio posicionados na base antes das opções de resposta */}
        {!isFlipped && !responseMethod && mode !== 'ultimato' && (
          <div className="rv-panel rv-modebar" onClick={e => e.stopPropagation()}>
            <div className="rv-between">
              <div className="rv-row" role="group" aria-label="Modos de estudo">
                <button
                  onClick={() => {
                    setIsSimuladoMode(!isSimuladoMode)
                    if (isBossMode) setIsBossMode(false) // Desliga boss mode se desligar simulado
                    if (isCrammingMode) setIsCrammingMode(false)
                    setSelectedQuizOption(null)
                    setQuizOptions([])
                    setAiFeedback(null)
                    setIsFlipped(false)
                  }}
                  className="rv-button"
                  aria-pressed={isSimuladoMode && !isBossMode}
                  title="Alternar para Simulado de Múltipla Escolha"
                >
                  <Sparkles size={15} aria-hidden="true" /> Simulado
                </button>

                <button
                  onClick={() => {
                    const newState = !isBossMode
                    setIsBossMode(newState)
                    if (newState) {
                      setIsSimuladoMode(true)
                      setIsCrammingMode(false)
                      const remainingCards = cards.length - currentIndex
                      // Define o HP como no máximo 5, ou a quantidade de cards restantes (o que for menor)
                      const calculatedHp = Math.max(1, Math.min(5, Math.floor(remainingCards * 0.8)))
                      setMaxBossHp(calculatedHp)
                      setBossHp(calculatedHp)
                      setPlayerHp(calculatedHp)
                      setIsBossDefeated(false)
                      setIsPlayerDefeated(false)

                      // Escolhe uma música aleatória para a batalha
                      const tracks = [
                        '/sounds/battle.mp3',
                        '/sounds/battle_2.mp3',
                        '/sounds/battle_3.mp3',
                        '/sounds/battle_4.mp3',
                        '/sounds/battle_5.mp3'
                      ]
                      const randomTrack = tracks[Math.floor(Math.random() * tracks.length)]
                      setCurrentBattleTrack(randomTrack)

                      if (!isZenMode) playMKSFX('fight')
                    }
                    setSelectedQuizOption(null)
                    setQuizOptions([])
                    setAiFeedback(null)
                    setIsFlipped(false)
                  }}
                  className="rv-button"
                  aria-pressed={isBossMode}
                  title="Modo Batalha (Boss Fight)"
                >
                  <Swords size={15} aria-hidden="true" /> Batalha
                </button>

                {/* Botão de Modo Sobrevivência */}
                <button
                  onClick={toggleCrammingMode}
                  className="rv-button"
                  aria-pressed={isCrammingMode}
                  title="Modo Sobrevivência (Estudo Rápido de Véspera)"
                >
                  <Flame size={15} aria-hidden="true" /> Véspera
                </button>

                {/* Botão de Modo Imersão */}
                <button
                  onClick={toggleZenMode}
                  className="rv-button"
                  aria-pressed={isZenMode}
                  title="Modo Imersão (Sons de Chuva e Layout Clean)"
                >
                  <Headphones size={15} aria-hidden="true" /> Imersão
                </button>
              </div>

              <button
                onClick={() => speakText(`${activeCard.front}. A resposta é: ${activeCard.back}`)}
                className="rv-button rv-quiet"
                title={isSpeaking ? "Parar leitura por voz" : "Ouvir o card em áudio (Podcast)"}
              >
                {isTtsLoading ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    <span>Carregando…</span>
                  </>
                ) : isSpeaking ? (
                  <>
                    <VolumeX className="size-3" />
                    <span>Parar leitura</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="size-3" />
                    <span>Ouvir card</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {isFlipped && (
          mode === 'ultimato' ? (
            <div className="w-full" onClick={e => e.stopPropagation()}>
              {ultimatumTimer > 0 ? (
                <button
                  disabled
                  className="rv-button w-full"
                >
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Leia a resposta · {ultimatumTimer}s</span>
                </button>
              ) : (
                <button
                  onClick={() => handleReview(Rating.Again)}
                  className="rv-button rv-primary w-full"
                >
                  Marcar como errado e avançar <ArrowRight size={15} aria-hidden="true" />
                </button>
              )}
            </div>
          ) : (
            <section className="rv-panel rv-grading" aria-labelledby="classificar-flashcard">
              <p id="classificar-flashcard">Como foi lembrar? O intervalo abaixo é uma estimativa.</p>
              <div className="rv-ratings">
                {reviewRatings.map(({ grade, key, tone, label }) => (
                  <button
                    key={key}
                    type="button"
                    disabled={isSubmitting || (grade === Rating.Easy && !canRateEasy)}
                    onClick={() => handleReview(grade)}
                    className="rv-rating"
                    data-grade={tone}
                    aria-keyshortcuts={key}
                    title={grade === Rating.Easy && aiFeedback?.correct === false ? 'A avaliação indicou que a resposta estava incorreta.' : undefined}
                  >
                    <strong>{label}</strong><span>{getIntervalLabel(grade)}</span>
                  </button>
                ))}
              </div>
            </section>
          )
        )}
        </div>
      </div>

      {/* Modal de contexto da nota */}
      {showContext && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col p-4 md:p-10 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="flex justify-between items-center w-full max-w-4xl mx-auto mb-6">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              {activeCard.notes.title}
            </h3>
            <button aria-label="Fechar contexto da nota" onClick={() => setShowContext(false)} className="p-2 bg-surface-elevated rounded-full text-text-muted hover:text-text-strong transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div ref={contextModalRef} className="w-full max-w-4xl mx-auto flex-1 panel p-6 overflow-y-auto prose max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {activeCard.notes.content}
            </ReactMarkdown>
          </div>

          <div className="w-full max-w-4xl mx-auto mt-6 flex justify-end">
            <Link href={`/dashboard/${activeCard.notes.workspace_id}/note/${activeCard.notes.id}`} className="btn-primary px-6 py-3">
              Ir para a Anotação Completa
            </Link>
          </div>
        </div>
      )}

      {/* 🆕 MODAL DE VÍDEO DO YOUTUBE */}
      {showVideoModal && videoUrl && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex flex-col items-center justify-center p-4 md:p-10 animate-in fade-in duration-200">
          <div className="w-full max-w-4xl bg-surface rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-border/50">
              <h4 className="text-white font-medium flex items-center gap-2">
                <PlayCircle className="size-5 text-red-500" />
                Vídeo Explicativo
              </h4>
              <button aria-label="Fechar vídeo" onClick={() => { setShowVideoModal(false); setVideoUrl(''); }} className="text-text-muted hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="relative w-full aspect-video bg-black">
              <iframe
                width="100%"
                height="100%"
                src={videoUrl}
                title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0"
              />
            </div>
          </div>
        </div>
      )}

      {/* 🆕 TOAST DE ERRO */}
      {uiError && (
        <div role="alert" className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg shadow-lg z-[100] max-w-[calc(100vw-3rem)]">
          <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium leading-tight">{uiError}</span>
          <button aria-label="Dispensar aviso" onClick={() => setUiError(null)} className="ml-2 opacity-70 hover:opacity-100 transition-opacity">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}
