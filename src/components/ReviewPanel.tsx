'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
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
  Volume2,
  VolumeX,
  PlayCircle,
  Flame,
  Maximize2,
  Minimize2,
  Skull,
  Ghost,
} from 'lucide-react'
import RelearningAlert from './RelearningAlert'
import { useSettings } from '@/contexts/SettingsContext'
import { getBestVoice } from '@/utils/audio'
import { evaluateAnswerWithGroq, generateDistractorsWithGroq } from '@/actions/groq'
import { searchYoutubeExplanation } from '@/actions/externalContent' // NOVA IMPORT

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

export default function ReviewPanel({ initialCards }: { initialCards: ReviewCard[] }) {
  const { settings } = useSettings()
  const [cards, setCards] = useState<ReviewCard[]>(initialCards)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showContext, setShowContext] = useState(false)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [openAccordion, setOpenAccordion] = useState<'analogia' | 'mnemonico' | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
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

  const [isUsingAdvancedSpeech, setIsUsingAdvancedSpeech] = useState(false)

  useEffect(() => {
    if (settings?.transcription_mode) {
      setIsUsingAdvancedSpeech(settings.transcription_mode === 'whisper')
    }
  }, [settings?.transcription_mode])
  const recognitionRef = useRef<any>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
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
  const [isSimuladoMode, setIsSimuladoMode] = useState(false)
  const [quizOptions, setQuizOptions] = useState<string[]>([])
  const [selectedQuizOption, setSelectedQuizOption] = useState<string | null>(null)
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false)
  
  // ESTADOS DO MODO BATALHA (BOSS FIGHT)
  const [isBossMode, setIsBossMode] = useState(false)
  const [bossHp, setBossHp] = useState(5)
  const [playerHp, setPlayerHp] = useState(5)
  const [maxBossHp, setMaxBossHp] = useState(5)
  const [isBossDefeated, setIsBossDefeated] = useState(false)
  const [isPlayerDefeated, setIsPlayerDefeated] = useState(false)
  const [combatFeedback, setCombatFeedback] = useState<'hit' | 'miss' | null>(null)
  
  // Áudio de Batalha
  const [isMusicEnabled, setIsMusicEnabled] = useState(true)
  const [currentBattleTrack, setCurrentBattleTrack] = useState('/sounds/battle.mp3')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const activeCard = cards[currentIndex]
  
  // Variáveis computadas para o Boss Mode
  const isEnrageMode = isBossMode && bossHp === 1
  const isCriticalDanger = isBossMode && playerHp === 1

  // --- Inicialização do reconhecimento de voz ---
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
      }
    }
  }, [])

  // Efeito da Música de Batalha
  useEffect(() => {
    if (audioRef.current) {
      if (isBossMode && isMusicEnabled) {
        audioRef.current.volume = 0.3
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

  // --- Atalhos de teclado ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (showContext || showVideoModal) return // Impede atalhos se modais estiverem abertos
      if (!activeCard) return

      if (!isFlipped) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          setIsFlipped(true)
        }
      } else {
        switch (e.key) {
          case '1':
            e.preventDefault()
            handleReview(Rating.Again)
            break
          case '2':
            e.preventDefault()
            handleReview(Rating.Hard)
            break
          case '3':
            e.preventDefault()
            handleReview(Rating.Good)
            break
          case '4':
            e.preventDefault()
            handleReview(Rating.Easy)
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFlipped, activeCard, showContext, showVideoModal])

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
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
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

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
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
    // Para qualquer áudio que esteja tocando antes de tocar o novo
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 0.9;
    utterance.pitch = 1.2;
    const selectedVoice = getBestVoice(settings.tts_voice)
    if (selectedVoice) {
      utterance.voice = selectedVoice
    }
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
      if (isUsingAdvancedSpeech && mediaRecorderRef.current) {
        const stream = mediaRecorderRef.current.stream
        stream.getTracks().forEach(track => track.stop())
        setIsRecording(false)
      } else {
        recognitionRef.current?.stop()
      }
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

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      showError('Seu navegador não suporta reconhecimento de voz nativo.')
      return
    }

    if (isRecording) {
      recognitionRef.current.stop()
      setIsRecording(false)
    } else {
      setUserAnswerText('')
      setResponseMethod('voice')
      recognitionRef.current.start()
      setIsRecording(true)
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
    if (isCorrect) {
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
    setTranscript('')
    setOpenAccordion(null)
    setIsConfirmingDelete(false)
    setResponseMethod(null)
    setAiFeedback(null)
    setUserAnswerText('')
    setSelectedQuizOption(null)
    setQuizOptions([])
    setCurrentIndex(prev => prev + 1)

    // 3. Salva a revisão no banco em background sem bloquear a interface do usuário
    submitReview(activeCard.id, activeCard, grade)
      .then((res) => {
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
      })
      .catch((error) => {
        console.error('Erro ao salvar revisão em background:', error)
      })
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
      setTranscript('')
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

  // --- Renderização final ---
  if (!activeCard) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div className="relative w-64 h-64 mb-2 drop-shadow-2xl opacity-90 hover:opacity-100 transition-opacity">
          {/* Subtle glow behind image */}
          <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
          <img src="/images/empty_state_astronaut.png" alt="Tudo em dia" className="w-full h-full object-contain rounded-3xl" />
        </div>
        <h2 className="text-3xl font-bold text-text-strong tracking-tight mt-4">Tudo em dia!</h2>
        <p className="text-text-medium max-w-sm text-lg">
          Você não tem flashcards pendentes no momento. O algoritmo FSRS avisará quando sua memória precisar ser reativada.
        </p>
      </div>
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
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center justify-center h-[calc(100vh-140px)] relative">
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
            <audio ref={audioRef} src="/sounds/battle.mp3" loop />
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

      {/* Progress Bar */}
      <div className="w-full mb-6 space-y-2 shrink-0">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-text-strong">{currentIndex + 1} de {cards.length}</span>
          <span className="text-xs text-text-muted">
            {Math.round(((currentIndex + 1) / cards.length) * 100)}%
          </span>
        </div>
        <div className="h-2 bg-surface-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / cards.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Barra superior: contador + ações */}
      <div className="w-full mb-6 flex items-center justify-between text-sm font-medium shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-text-muted">Cartão {currentIndex + 1} de {cards.length}</span>
        </div>

        <div className="flex items-center gap-2">
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
                className="p-2 text-text-muted hover:text-error hover:bg-error-soft/50 rounded-lg transition-colors disabled:opacity-50"
                title="Excluir Flashcard"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <button
                onClick={() => setShowContext(true)}
                className="btn-secondary text-primary px-3 py-1.5 h-8 text-xs flex items-center gap-1.5 rounded-lg border-border"
                title="Ver Contexto da Nota"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Ver Contexto</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Painel principal do card */}
      <div
        className={`w-full panel p-6 md:p-10 flex-1 min-h-0 overflow-y-auto flex flex-col relative transition-all duration-300 custom-scrollbar cursor-pointer
          ${isEnrageMode ? 'shadow-[0_0_20px_rgba(239,68,68,0.6)] border-red-500/50' : ''}
          ${combatFeedback === 'miss' ? 'animate-shake border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]' : ''}
          ${combatFeedback === 'hit' ? 'border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.4)]' : ''}
        `}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={() => !isFlipped && !responseMethod && !isSimuladoMode && setIsFlipped(true)}
      >
        {isEvaluating ? (
          <div className="text-center flex flex-col h-full justify-center items-center my-auto animate-pulse">
            <BrainCircuit className="size-16 text-primary animate-bounce mb-4" />
            <h4 className="text-xl font-medium text-text-strong mb-2">Tutor AI avaliando sua resposta...</h4>
            <p className="text-sm text-text-muted">Analisando conceitos com Llama 3.3 70B</p>
          </div>
        ) : !isFlipped ? (
          <div className="text-center flex flex-col flex-1 animate-in fade-in zoom-in-95 duration-200">
            <span className="uppercase text-xs font-bold tracking-widest text-text-muted mb-4 mt-2 block shrink-0">Pergunta</span>
            <h3 className="text-2xl md:text-3xl font-medium text-text-strong leading-relaxed mb-6 shrink-0">
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
            ) : responseMethod && (
              <div 
                className="w-full mt-auto pt-6 border-t border-border shrink-0 animate-in fade-in slide-in-from-bottom-4 duration-200 text-left"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="relative">
                  <textarea
                    ref={textareaRef}
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
              </div>
            )}
          </div>
        ) : (
          <div className="text-center animate-in fade-in zoom-in-95 duration-200 flex flex-col flex-1">
            {isSimuladoMode ? (
              <>
                <span className="uppercase text-xs font-bold tracking-widest text-text-muted mb-4 mt-2 block shrink-0">Pergunta</span>
                <h3 className="text-xl md:text-2xl font-medium text-text-strong mb-6 leading-snug shrink-0">
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
                <span className="uppercase text-xs font-bold tracking-widest text-primary mb-6 block shrink-0">Resposta Correta</span>
                <p className="text-xl md:text-2xl text-text-strong leading-relaxed font-light mb-8">
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
                        <p className="text-text-medium text-xs italic">"{userAnswerText}"</p>
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
                <p className="text-text-strong text-sm italic">"{userAnswerText}"</p>
              </div>
            )}

            <button onClick={e => { e.stopPropagation(); setIsFlipped(false); setAiFeedback(null) }} className="btn-ghost mt-6 mx-auto w-fit shrink-0">
              <RotateCcw className="w-4 h-4" />
              Reler Pergunta
            </button>
          </div>
        )}
      </div>

      {/* Barra FSRS ou botões de resposta por Voz/Texto */}
      <div className="w-full mt-6 space-y-3 shrink-0">
        {/* Simulado e Áudio posicionados na base antes das opções de resposta */}
        {!isFlipped && !responseMethod && (
          <div className="flex items-center justify-between gap-3 w-full border-t border-border/40 pt-3.5 pb-1" onClick={e => e.stopPropagation()}>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setIsSimuladoMode(!isSimuladoMode)
                  if (isBossMode) setIsBossMode(false) // Desliga boss mode se desligar simulado
                  setSelectedQuizOption(null)
                  setQuizOptions([])
                  setAiFeedback(null)
                  setIsFlipped(false)
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                  isSimuladoMode && !isBossMode
                    ? 'bg-primary/20 text-primary border-primary/30 hover:bg-primary/30'
                    : 'bg-surface-muted text-text-medium border-border hover:border-border-strong hover:bg-surface-elevated hover:text-text-strong'
                }`}
                title="Alternar para Simulado de Múltipla Escolha"
              >
                <Sparkles className="size-3" />
                <span>{isSimuladoMode && !isBossMode ? '⚖️ Simulado ON' : 'Simulado OFF'}</span>
              </button>

              <button
                onClick={() => {
                  const newState = !isBossMode
                  setIsBossMode(newState)
                  if (newState) {
                    setIsSimuladoMode(true)
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
                    
                    playMKSFX('fight')
                  }
                  setSelectedQuizOption(null)
                  setQuizOptions([])
                  setAiFeedback(null)
                  setIsFlipped(false)
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                  isBossMode
                    ? 'bg-red-500/20 text-red-500 border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.3)]'
                    : 'bg-surface-muted text-text-medium border-border hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-500'
                }`}
                title="Modo Batalha (Boss Fight)"
              >
                <span className={isBossMode ? "animate-pulse" : ""}>⚔️ Batalha</span>
              </button>
            </div>

            <button
              onClick={() => speakText(`${activeCard.front}. A resposta é: ${activeCard.back}`)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-border bg-surface-muted text-text-medium hover:text-text-strong hover:border-border-strong hover:bg-surface-elevated flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
              title="Ouvir o card em áudio (Podcast)"
            >
              <Volume2 className="size-3.5" />
              <span>Ouvir Card</span>
            </button>
          </div>
        )}

        {isFlipped && (
          <div className="flex gap-2 justify-center text-xs">
            <div className="px-3 py-1.5 bg-success-soft/50 rounded-full text-success font-medium border border-success/20">✓ {sessionStats.correct}</div>
            <div className="px-3 py-1.5 bg-warning-soft/50 rounded-full text-warning font-medium border border-warning/20">⚠ {sessionStats.hard}</div>
            <div className="px-3 py-1.5 bg-error-soft/50 rounded-full text-error font-medium border border-error/20">✗ {sessionStats.wrong}</div>
          </div>
        )}

        {!isFlipped ? (
          isSimuladoMode ? (
            <div className="w-full text-center py-4 text-xs text-text-muted font-medium bg-surface-muted/20 border border-border/50 rounded-2xl animate-in fade-in duration-200">
              Escolha uma das alternativas acima para responder o simulado.
            </div>
          ) : responseMethod ? (
            <div className="flex gap-3 w-full">
              <button onClick={handleCancelRecording} className="btn-secondary h-14 text-sm font-semibold rounded-2xl flex-1 hover:bg-surface-hover" disabled={isEvaluating}>
                Cancelar
              </button>
              {responseMethod === 'voice' && isRecording ? (
                <button onClick={toggleRecording} className="btn-secondary h-14 text-sm font-semibold rounded-2xl flex-1 text-error border-error/20 hover:bg-error-soft/50 flex items-center justify-center gap-2 animate-pulse">
                  <Square className="size-4 fill-current animate-scale" />
                  Concluir Fala
                </button>
              ) : (
                <button onClick={handleEvaluateWithAI} disabled={!userAnswerText.trim() || isEvaluating} className="btn-primary h-14 text-base font-semibold rounded-2xl flex-[2] bg-gradient-to-r from-primary to-primary-hover flex items-center justify-center gap-2 shadow-[var(--shadow-soft)] disabled:opacity-50">
                  {isEvaluating ? (
                    <><Loader2 className="size-5 animate-spin" /><span>Analisando...</span></>
                  ) : (
                    <><Sparkles className="size-5" /><span>Avaliar com IA</span></>
                  )}
                </button>
              )}
            </div>
          ) : (
            <div className="w-full flex flex-col gap-3">
              {/* Opção de Transcrição Avançada */}
              <div className="flex items-center justify-end gap-2 px-1">
                <label className="text-xs font-semibold text-text-muted cursor-pointer flex items-center gap-1.5 select-none">
                  <input
                    type="checkbox"
                    checked={isUsingAdvancedSpeech}
                    onChange={(e) => setIsUsingAdvancedSpeech(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary size-3.5"
                  />
                  <span>Transcrição Avançada (Groq Whisper ⚡)</span>
                </label>
              </div>

              <div className="grid grid-cols-2 sm:flex sm:flex-row gap-3 w-full">
                <button onClick={() => { setResponseMethod('voice'); toggleRecording() }} className="col-span-1 flex items-center justify-center gap-2 btn-secondary h-14 text-base font-semibold rounded-2xl flex-1 hover:bg-surface-hover transition-colors">
                  <Mic className="size-5 text-primary" /><span>Voz</span>
                </button>
                <button onClick={() => { setResponseMethod('text'); setUserAnswerText(''); setTimeout(() => { const textarea = document.querySelector('textarea'); textarea?.focus() }, 50) }} className="col-span-1 flex items-center justify-center gap-2 btn-secondary h-14 text-base font-semibold rounded-2xl flex-1 hover:bg-surface-hover transition-colors">
                  <Keyboard className="size-5 text-primary" /><span>Texto</span>
                </button>
                <button onClick={() => setIsFlipped(true)} className="col-span-2 btn-primary h-14 text-base font-semibold rounded-2xl flex-1 sm:flex-[1.5] bg-primary hover:bg-primary-hover text-white flex items-center justify-center shadow-[var(--shadow-soft)]">
                  Mostrar Resposta
                </button>
              </div>
            </div>
          )
        ) : (
          <div className="grid grid-cols-4 gap-2 w-full animate-in fade-in duration-200">
            <button disabled={isSubmitting} onClick={() => handleReview(Rating.Again)} className="flex flex-col items-center justify-center bg-error-soft/50 hover:bg-error-soft border border-error/20 rounded-2xl text-error transition-all active:scale-95 disabled:opacity-50 py-3">
              <span className="font-bold mb-1 md:text-base text-sm">Errei</span>
              <span className="text-[10px] uppercase opacity-70">{getIntervalLabel(Rating.Again)}</span>
            </button>
            <button disabled={isSubmitting} onClick={() => handleReview(Rating.Hard)} className="flex flex-col items-center justify-center bg-warning-soft/50 hover:bg-warning-soft border border-warning/20 rounded-2xl text-warning transition-all active:scale-95 disabled:opacity-50 py-3">
              <span className="font-bold mb-1 md:text-base text-sm">Difícil</span>
              <span className="text-[10px] uppercase opacity-70">{getIntervalLabel(Rating.Hard)}</span>
            </button>
            <button disabled={isSubmitting} onClick={() => handleReview(Rating.Good)} className="flex flex-col items-center justify-center bg-primary-soft/50 hover:bg-primary-soft border border-primary/20 rounded-2xl text-primary transition-all active:scale-95 disabled:opacity-50 py-3">
              <span className="font-bold mb-1 md:text-base text-sm">Bom</span>
              <span className="text-[10px] uppercase opacity-70">{getIntervalLabel(Rating.Good)}</span>
            </button>
            <button disabled={isSubmitting || (aiFeedback !== null && !aiFeedback.correct)} onClick={() => handleReview(Rating.Easy)} className={`flex flex-col items-center justify-center bg-success-soft/50 hover:bg-success-soft border border-success/20 rounded-2xl text-success transition-all active:scale-95 py-3 ${aiFeedback !== null && !aiFeedback.correct ? 'opacity-40 cursor-not-allowed hover:bg-success-soft/50 active:scale-100' : 'disabled:opacity-50'}`} title={aiFeedback !== null && !aiFeedback.correct ? "O Tutor AI avaliou que você errou a resposta, por isso a opção 'Fácil' foi desabilitada." : undefined}>
              <span className="font-bold mb-1 md:text-base text-sm">Fácil</span>
              <span className="text-[10px] uppercase opacity-70">{getIntervalLabel(Rating.Easy)}</span>
            </button>
          </div>
        )}
      </div>

      {/* Modal de contexto da nota */}
      {showContext && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col p-4 md:p-10 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="flex justify-between items-center w-full max-w-4xl mx-auto mb-6">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              {activeCard.notes.title}
            </h3>
            <button onClick={() => setShowContext(false)} className="p-2 bg-surface-elevated rounded-full text-text-muted hover:text-text-strong transition-colors">
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
              <button onClick={() => { setShowVideoModal(false); setVideoUrl(''); }} className="text-text-muted hover:text-white transition-colors">
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
      <div className={`fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 bg-red-500 text-white rounded-lg shadow-lg backdrop-blur-md transition-all duration-300 z-[100] max-w-sm ${uiError ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0 pointer-events-none'}`}>
        <AlertTriangle className="size-5 shrink-0" />
        <span className="text-sm font-medium leading-tight">{uiError}</span>
        <button onClick={() => setUiError(null)} className="ml-2 opacity-70 hover:opacity-100 transition-opacity">
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}