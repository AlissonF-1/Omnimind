'use client'

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, ChevronDown, History, Layers, MessageSquare, Mic, Send, Settings, Square, X } from '@/components/icons'
import { confirmAssistantExamAction } from '@/actions/chat'
import { useSettings } from '@/contexts/SettingsContext'
import type { AcademyMentor } from '@/lib/academy/contracts'
import { assistantHistoryKey, assistantPath, isAssistantPersona, parseAssistantHistory, type AssistantPersona } from '@/lib/assistant/contracts'
import {
  assistantDisplayText, assistantMessageId, assistantTitle, emptyAssistantHistory, limitAssistantMessages,
  newAssistantConversation, newConversationTitle, parseAssistantSources, readAssistantHistory, saveAssistantHistory,
  type AssistantConversation, type AssistantMessage as Message,
} from '@/lib/assistant/history'
import {
  assistantOutputLimits, assistantProviderIds, assistantProviders, assistantQuestionLimit, isAssistantProvider,
  parseGenerationMetadata, type AssistantProvider,
} from '@/lib/assistant/providers'
import { AssistantReplyError, readAssistantReply, type AssistantRequest } from '@/lib/assistant/reply'
import {
  learningConsentMessage, learningTutorHistoryScope, learningTutorModes, learningTutorQuestion, openAssessmentTutorMessage, parseLearningTutorLabel,
  writeLearningTutorSearch, type LearningTutorContext, type LearningTutorHint, type LearningTutorLabel,
} from '@/lib/assistant/learning-tutor'
import { learningHref, learningPath } from '@/lib/learning/progress'
import { getBestVoice } from '@/utils/audio'
import AssistantHistory from './assistant/AssistantHistory'
import AssistantMessage from './assistant/AssistantMessage'
import AssistantTraining from './assistant/AssistantTraining'
import AssistantWelcome, { assistantPersonas } from './assistant/AssistantWelcome'
import { useAssistantIdentity } from './assistant/useAssistantIdentity'
import './assistant/assistant.css'

type Workspace = { id: string; name: string }

type ChatPanelProps = {
  accountId: string
  workspaces: Workspace[]
  initialWorkspaceId?: string
  learning?: LearningTutorContext
  initialLearningLabel?: LearningTutorLabel
  academy?: AcademyMentor
  onClose?: () => void
}

type Dialog = { kind: 'exam' } | { kind: 'rename' | 'delete'; conversation: AssistantConversation }
type PendingReply = { conversationId: string; messageId: string; input: AssistantRequest }
type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

function disposeSpeech(recognition: Recognition | null) {
  if (!recognition) return
  recognition.onresult = null
  recognition.onerror = null
  recognition.onend = null
  recognition.abort()
}

function AssistantWorkspace({ accountId, workspaceId, workspaces, onWorkspaceChange, firstName, onClose, learning, initialLearningLabel, academy }: {
  accountId: string
  workspaceId: string
  workspaces: Workspace[]
  onWorkspaceChange: (value: string) => void
  firstName: string
  onClose?: () => void
  learning?: LearningTutorContext
  initialLearningLabel?: LearningTutorLabel
  academy?: AcademyMentor
}) {
  const { settings } = useSettings()
  const pathname = usePathname()
  const search = useSearchParams()
  const storageKey = assistantHistoryKey(accountId, workspaceId) + (learning ? ':' + learningTutorHistoryScope(learning) : academy ? ':academy:' + academy.key : '')
  const [state, setState] = useState(() => {
    try { return readAssistantHistory(window.sessionStorage, storageKey) }
    catch { return emptyAssistantHistory() }
  })
  const [defaultPersona, setDefaultPersona] = useState<AssistantPersona>('tutor')
  const [query, setQuery] = useState(academy?.question ?? '')
  const [floatingTrainingOpen, setFloatingTrainingOpen] = useState(false)
  const trainingOpen = !learning && (pathname === assistantPath ? search.get('treino') === '1' : floatingTrainingOpen)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [pendingProvider, setPendingProvider] = useState<AssistantProvider | null>(null)
  const [providerOverride, setProviderOverride] = useState<AssistantProvider | null>(learning ? state.learningProvider ?? null : null)
  const [contextChoice, setContextChoice] = useState<{ provider: AssistantProvider; allowed: boolean } | null>(null)
  const [learningConsent, setLearningConsent] = useState<AssistantProvider | null>(null)
  const [outputLimit, setOutputLimit] = useState<number>()
  const [retry, setRetry] = useState<PendingReply | null>(null)
  const [alternate, setAlternate] = useState<AssistantProvider>('gemini')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [dialogError, setDialogError] = useState('')
  const [savingExam, setSavingExam] = useState(false)
  const request = useRef<AbortController | null>(null)
  const recognition = useRef<Recognition | null>(null)
  const speaking = useRef(false)
  const scroll = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const historyDialog = useRef<HTMLDialogElement>(null)
  const confirmDialog = useRef<HTMLDialogElement>(null)
  const contextDescriptionId = useId()
  const learningDescriptionId = useId()
  const assistantConversation = state.conversations.find(({ id }) => id === state.activeConversationId)
  const messages = assistantConversation?.messages ?? []
  const persona = assistantConversation?.persona ?? defaultPersona
  const configuredProvider = isAssistantProvider(settings.ai_default_model) ? settings.ai_default_model : 'gemini'
  const provider = providerOverride ?? configuredProvider
  const includeContext = contextChoice?.provider === provider ? contextChoice.allowed
    : !learning && !academy && provider === 'gemini' && !messages.some(({ generation }) => generation && generation.provider !== provider)
  const retryForConversation = retry?.conversationId === assistantConversation?.id ? retry : null
  const label = state.learningLabel ?? initialLearningLabel
  const completedHints = Math.max(0, ...messages.map((message) => message.learningHint ?? 0))
  const nextHint = completedHints < 3 ? (completedHints + 1) as LearningTutorHint : null
  const fullPageHref = learning ? assistantPath + '?' + writeLearningTutorSearch(new URLSearchParams(), learning, workspaceId) : assistantPath

  useEffect(() => {
    try { saveAssistantHistory(window.sessionStorage, storageKey, state) } catch { /* Armazenamento bloqueado no navegador. */ }
  }, [state, storageKey])

  useEffect(() => () => {
    request.current?.abort()
    disposeSpeech(recognition.current)
    if (speaking.current) window.speechSynthesis?.cancel()
  }, [])

  useEffect(() => {
    const timeline = scroll.current
    if (timeline && timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 240) {
      timeline.scrollTop = timeline.scrollHeight
    }
  }, [state, pendingId])

  useEffect(() => {
    const box = input.current
    if (!box) return
    box.style.height = 'auto'
    box.style.height = Math.min(box.scrollHeight, 110) + 'px'
  }, [query])

  useEffect(() => {
    if (dialog && !confirmDialog.current?.open) confirmDialog.current?.showModal()
  }, [dialog])

  function updateConversation(id: string, update: (conversation: AssistantConversation) => AssistantConversation) {
    setState((current) => ({
      ...current,
      conversations: current.conversations.map((conversation) => conversation.id === id ? update(conversation) : conversation),
    }))
  }

  function changePersona(value: AssistantPersona) {
    if (assistantConversation) updateConversation(assistantConversation.id, (entry) => ({ ...entry, persona: value }))
    else setDefaultPersona(value)
  }

  function showTraining(open: boolean) {
    if (pathname !== assistantPath) {
      setFloatingTrainingOpen(open)
      return
    }
    const params = new URLSearchParams(window.location.search)
    if (open) params.set('treino', '1')
    else params.delete('treino')
    window.history.replaceState(null, '', pathname + (params.size ? '?' + params : ''))
  }

  function selectConversation(id: string) {
    if (trainingOpen) showTraining(false)
    setState((current) => ({ ...current, activeConversationId: id }))
    setQuery('')
    setCopiedId(null)
    setContextChoice(null)
    setLearningConsent(null)
    setRetry(null)
    historyDialog.current?.close()
    if (scroll.current) scroll.current.scrollTop = 0
  }

  function startConversation() {
    if (trainingOpen) showTraining(false)
    const entry = newAssistantConversation('tutor')
    setState((current) => ({ ...current, conversations: [entry, ...current.conversations], activeConversationId: entry.id }))
    setQuery('')
    setNotice('')
    setContextChoice(null)
    setLearningConsent(null)
    setRetry(null)
    historyDialog.current?.close()
    input.current?.focus()
  }

  function openDialog(next: Dialog) {
    historyDialog.current?.close()
    setDialogError('')
    setDialog(next)
  }

  function stopResponse() {
    request.current?.abort()
    request.current = null
    setPendingId(null)
    setPendingProvider(null)
    setState((current) => ({
      ...current,
      conversations: current.conversations.map((entry) => ({
        ...entry,
        messages: entry.messages.filter(({ id, content }) => id !== pendingId || content.trim())
          .map((message) => message.id === pendingId ? { ...message, interruption: 'Geração cancelada.' } : message),
      })),
    }))
    setNotice('Geração cancelada.')
  }

  async function ask(value = query, hintLevel?: LearningTutorHint) {
    const question = value.trim()
    if (request.current || question.length < 3 || question.length > assistantQuestionLimit) return
    if (learning?.mode === 'explain-error' && learningConsent !== provider) return setNotice(learningConsentMessage)
    const conversation = assistantConversation ?? newAssistantConversation(persona)
    const messageId = assistantMessageId()
    const userMessage: Message = { id: assistantMessageId(), role: 'user', content: question, generation: { provider } }
    const placeholder: Message = { id: messageId, role: 'ai', content: '' }
    setQuery('')
    setState((current) => {
      const next = {
        ...conversation,
        title: conversation.messages.length === 0 && conversation.title === newConversationTitle ? assistantTitle(question) : conversation.title,
        messages: limitAssistantMessages([...conversation.messages, userMessage, placeholder]),
        updatedAt: Date.now(),
      }
      return { ...current, conversations: [next, ...current.conversations.filter(({ id }) => id !== next.id)], activeConversationId: next.id }
    })
    await runReply({
      conversationId: conversation.id,
      messageId,
      input: {
        accountId, question, workspaceId: workspaceId || null, persona, contextRoute: pathname,
        history: includeContext && (!learning || (learning.mode === 'explain' && learningConsent === provider))
          ? parseAssistantHistory(conversation.messages.filter((message) => !message.error && !message.interruption)) : [],
        ecoMode: settings.eco_mode, model: provider, maxOutputTokens: outputLimit,
        contextConsent: includeContext ? provider : null,
        learning: learning ? { ...learning, hintLevel } : undefined,
        learningConsent: learningConsent === provider ? provider : null,
      },
    })
  }

  async function runReply(attempt: PendingReply) {
    if (request.current) return
    const { conversationId, messageId, input: payload } = attempt
    const respondingProvider = payload.fallback?.provider ?? payload.model
    const controller = new AbortController()
    request.current = controller
    setPendingId(messageId)
    setPendingProvider(respondingProvider)
    setNotice('')
    setRetry(null)
    function changeMessage(update: Partial<Message>) {
      updateConversation(conversationId, (entry) => ({
        ...entry,
        messages: entry.messages.map((message) => message.id === messageId ? { ...message, ...update } : message),
      }))
    }
    changeMessage({ content: '', error: false, interruption: undefined, sources: undefined, generation: undefined, learningHint: undefined })

    let answer = ''
    let generation = parseGenerationMetadata({ provider: respondingProvider })
    try {
      for await (const { type, data } of readAssistantReply(payload, controller.signal)) {
        if (request.current !== controller) break
        switch (type) {
          case 'text':
            if (typeof data === 'string') {
              answer += data
              changeMessage({ content: assistantDisplayText(answer), generation })
            }
            break
          case 'sources':
            changeMessage({ sources: parseAssistantSources(data) })
            break
          case 'metadata': {
            const metadata = parseGenerationMetadata(data)
            if (metadata?.provider === respondingProvider) {
              generation = metadata
              changeMessage({ generation })
            }
            break
          }
          case 'notice':
            if (typeof data === 'string') setNotice(data)
            break
          case 'learning': {
            const summary = parseLearningTutorLabel(data)
            if (learning && summary) setState((current) => ({ ...current, learningLabel: summary }))
            break
          }
          case 'level-up':
          case 'achievement-unlocked':
            window.dispatchEvent(new CustomEvent(type, { detail: data }))
        }
      }
      if (!controller.signal.aborted && !assistantDisplayText(answer)) throw new AssistantReplyError('O Assistente retornou uma resposta vazia.')
      if (!controller.signal.aborted && payload.learning?.hintLevel) changeMessage({ learningHint: payload.learning.hintLevel })
    } catch (error) {
      if (controller.signal.aborted) return
      const failure = error instanceof AssistantReplyError ? error : new AssistantReplyError('A conexão foi interrompida. Tente novamente.')
      if (failure.sessionChanged) window.dispatchEvent(new Event('assistant-session-invalid'))
      if (failure.assessmentOpen) window.dispatchEvent(new Event('assistant-assessment-open'))
      const partial = assistantDisplayText(answer)
      changeMessage(partial ? { content: partial, interruption: failure.message }
        : { content: failure.message, error: true, generation: undefined })
      if (!answer && !payload.fallback && !failure.sessionChanged && failure.canRetry) {
        setRetry(attempt)
        setAlternate(assistantProviderIds.find((id) => id !== payload.model) ?? 'gemini')
      }
    } finally {
      if (request.current === controller) {
        request.current = null
        setPendingId(null)
        setPendingProvider(null)
      }
    }
  }

  function retryReply() {
    if (!retryForConversation || alternate === retryForConversation.input.model) return
    const previous = retryForConversation.input
    void runReply({
      ...retryForConversation,
      input: {
        ...previous,
        fallback: { provider: alternate, consent: true },
        contextConsent: previous.contextConsent ? alternate : null,
        learningConsent: previous.learningConsent ? alternate : null,
      },
    })
  }

  function toggleRecording() {
    if (recording) {
      recognition.current?.stop()
      setRecording(false)
      return
    }
    const browser = window as Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
    const VoiceRecognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition
    if (!VoiceRecognition) return setNotice('Este navegador não oferece ditado para o Assistente.')
    disposeSpeech(recognition.current)
    const recorder = new VoiceRecognition()
    recorder.lang = 'pt-BR'
    recorder.continuous = false
    recorder.interimResults = true
    recorder.onresult = ({ results }) => setQuery(Array.from(results, (result) => result[0]?.transcript ?? '').join(' '))
    recorder.onend = () => setRecording(false)
    recorder.onerror = () => {
      setRecording(false)
      setNotice('Não foi possível usar o microfone.')
    }
    recognition.current = recorder
    try {
      recorder.start()
      setRecording(true)
      setNotice('')
    } catch {
      setNotice('Não foi possível usar o microfone.')
    }
  }

  async function copy(message: Message) {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopiedId(message.id)
      setNotice('Resposta copiada.')
    } catch {
      setNotice('Não foi possível copiar a resposta.')
    }
  }

  function speak(text: string) {
    if (!window.speechSynthesis) return setNotice('Este navegador não oferece leitura em voz alta.')
    window.speechSynthesis.cancel()
    const audio = new SpeechSynthesisUtterance(text)
    audio.lang = 'pt-BR'
    audio.rate = 0.95
    const voice = getBestVoice(settings.tts_voice)
    if (voice) audio.voice = voice
    speaking.current = true
    audio.onend = () => { speaking.current = false }
    window.speechSynthesis.speak(audio)
  }

  function composerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && navigator.maxTouchPoints === 0) {
      event.preventDefault()
      void ask()
    }
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!dialog || savingExam) return
    const form = new FormData(event.currentTarget)
    if (dialog.kind === 'exam') {
      setSavingExam(true)
      setDialogError('')
      try {
        const outcome = await confirmAssistantExamAction(accountId, form)
        if (!outcome.success) {
          setDialogError(outcome.error ?? 'Não foi possível agendar a prova.')
          return
        }
        window.dispatchEvent(new Event('calendar-updated'))
        setNotice('Prova agendada no calendário.')
      } catch {
        setDialogError('Não foi possível agendar a prova.')
        return
      } finally {
        setSavingExam(false)
      }
    } else if (dialog.kind === 'rename') {
      const title = String(form.get('title') ?? '').trim()
      if (!title) return setDialogError('Informe um título para a conversa.')
      updateConversation(dialog.conversation.id, (entry) => ({ ...entry, title: title.slice(0, 80) }))
    } else {
      const id = dialog.conversation.id
      setState((current) => {
        const conversations = current.conversations.filter((entry) => entry.id !== id)
        return { ...current, conversations, activeConversationId: current.activeConversationId === id ? conversations[0]?.id ?? null : current.activeConversationId }
      })
    }
    confirmDialog.current?.close()
  }

  const historyProps = {
    conversations: state.conversations, activeId: assistantConversation?.id, create: startConversation, select: selectConversation,
    rename: (conversation: AssistantConversation) => openDialog({ kind: 'rename', conversation }),
    remove: (conversation: AssistantConversation) => openDialog({ kind: 'delete', conversation }),
  }
  const dialogTitle = dialog?.kind === 'exam' ? 'Agendar prova' : dialog?.kind === 'rename' ? 'Renomear conversa' : 'Excluir conversa'

  return (
    <div className="oa-shell">
      <header className="oa-header">
        <span className="oa-header-logo"><MessageSquare size={21} aria-hidden="true" /></span>
        <h1>Conversar com a IA</h1>
        {!learning && <button type="button" className="oa-button oa-training-toggle" disabled={!!pendingId} aria-pressed={trainingOpen}
          onClick={() => showTraining(!trainingOpen)}>{trainingOpen ? 'Conversas' : 'Treino interativo'}</button>}
        <button className="oa-icon oa-history-toggle" type="button" aria-label="Abrir histórico" onClick={() => historyDialog.current?.showModal()}><History size={20} aria-hidden="true" /></button>
        <Link href="/dashboard/configuracoes" prefetch={false} className="oa-icon" aria-label="Configurações do OmniMind" title="Configurações" onClick={onClose}><Settings size={19} aria-hidden="true" /></Link>
        {onClose && <button className="oa-icon" type="button" aria-label="Fechar Assistente" onClick={onClose}><X size={21} aria-hidden="true" /></button>}
      </header>

      <aside className="oa-history" aria-label="Histórico do Assistente"><AssistantHistory {...historyProps} /></aside>
      {trainingOpen && !learning ? <AssistantTraining accountId={accountId} defaultProvider={provider} eco={settings.eco_mode} />
        : <section className="oa-chat" aria-label="Conversa">
        <div className="oa-controls">
          <label className="oa-control"><span className="sr-only">Estilo da resposta</span>
            <select value={persona} onChange={(event) => { if (isAssistantPersona(event.target.value)) changePersona(event.target.value) }}>
              {assistantPersonas.map(({ id, title }) => <option key={id} value={id}>{title}</option>)}
            </select><ChevronDown size={15} aria-hidden="true" />
          </label>
          <label className="oa-control oa-workspace"><Layers size={17} aria-hidden="true" /><span className="sr-only">Workspace das fontes</span>
            <select value={workspaceId} onChange={(event) => onWorkspaceChange(event.target.value)}>
              <option value="">Todas as anotações</option>
              {workspaces.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </select><ChevronDown size={15} aria-hidden="true" />
          </label>
          <label className="oa-control"><span className="sr-only">Provedor da IA</span>
            <select value={provider} disabled={!!pendingId} onChange={(event) => {
              const next = event.target.value
              if (!isAssistantProvider(next)) return
              setProviderOverride(next)
              setContextChoice({ provider: next, allowed: false })
              setLearningConsent(null)
              if (learning) setState((current) => ({ ...current, learningProvider: next }))
            }}>
              {assistantProviderIds.map((id) => <option key={id} value={id}>{assistantProviders[id]}</option>)}
            </select><ChevronDown size={15} aria-hidden="true" />
          </label>
          <label className="oa-control"><span className="sr-only">Limite de saída</span>
            <select value={outputLimit ?? ''} disabled={!!pendingId} onChange={(event) => setOutputLimit(Number(event.target.value) || undefined)}>
              <option value="">{settings.eco_mode ? 'Econômico · 1.024 tokens' : 'Padrão · 2.048 tokens'}</option>
              {assistantOutputLimits.map((limit) => <option key={limit} value={limit}>{limit.toLocaleString('pt-BR')} tokens</option>)}
            </select><ChevronDown size={15} aria-hidden="true" />
          </label>
          {onClose && <Link href={fullPageHref} className="oa-open-page" prefetch={false} onClick={onClose}>Abrir página</Link>}
          <div className="oa-context-setting">
            <label><input type="checkbox" checked={includeContext} disabled={!!pendingId} aria-describedby={contextDescriptionId}
              onChange={(event) => setContextChoice({ provider, allowed: event.target.checked })} /> {learning ? 'Consultar minhas anotações' : 'Usar histórico e anotações'}</label>
            <p id={contextDescriptionId}>
              A pergunta vai para {assistantProviders[provider]}{includeContext ? ' com ' + (learning ? 'trechos das suas anotações' : 'o histórico, dados de estudo e trechos das fontes') : ''}.
              {provider !== 'gemini' && ' Com anotações ativadas, o Gemini também recebe a pergunta para localizar fontes.'}
              {provider === 'openrouter' && ' O OpenRouter encaminha a solicitação à hospedagem do modelo.'}
            </p>
          </div>
          {academy && <div className="oa-learning"><div className="oa-learning-heading">
            <div><p>OmniMind Academy</p><strong>{academy.title}</strong></div>
            <Link className="oa-button" prefetch={false} href={academy.href}>Voltar à aula</Link>
          </div></div>}
          {learning && <div className="oa-learning">
            <div className="oa-learning-heading">
              <div><p>{learningTutorModes[learning.mode]}</p><strong>{label ? label.pathTitle + ' · ' + label.stepTitle : 'Atividade da trilha'}</strong></div>
              {onClose ? <button type="button" className="oa-button" onClick={onClose}>Voltar à atividade</button> : (
                <Link className="oa-button" prefetch={false} href={label ? learningHref(label.slug, learning.stepId) : learningPath}>Voltar à trilha</Link>
              )}
            </div>
            <label><input type="checkbox" checked={learningConsent === provider} disabled={!!pendingId} aria-describedby={learningDescriptionId}
              onChange={(event) => setLearningConsent(event.target.checked ? provider : null)} /> Incluir meu progresso e tentativas</label>
            <p id={learningDescriptionId}>O conteúdo da etapa vai para {assistantProviders[provider]}. Seu progresso e suas tentativas só seguem com esta opção marcada.
              {learning.mode === 'explain' && ' Para enviar o histórico desta conversa, marque as duas opções.'}</p>
          </div>}
        </div>
        <div className="oa-scroll" ref={scroll}>
          {messages.length ? (
            <div className="oa-messages">
              {messages.map((message) => <AssistantMessage key={message.id} message={message} pending={pendingId === message.id}
                copied={copiedId === message.id} copy={() => { void copy(message) }} speak={() => speak(message.content)} />)}
            </div>
          ) : learning ? (
            <div className="oa-learning-intro">
              <Layers size={28} aria-hidden="true" />
              <h2>{learningTutorModes[learning.mode]}</h2>
              <p>{learning.mode === 'hint' ? 'Comece pelo conceito e avance uma dica por vez.'
                : learning.mode === 'explain-error' ? 'Autorize o uso da sua tentativa corrigida para receber uma explicação e um exercício de reforço.'
                  : 'Peça um exemplo ou faça uma pergunta sobre o conteúdo desta etapa.'}</p>
            </div>
          ) : <AssistantWelcome name={firstName} persona={persona} setPersona={changePersona} ask={(text) => { void ask(text) }} />}
        </div>
        <footer className="oa-footer">
          {notice && <p className="oa-notice" role="status">{notice}</p>}
          {pendingProvider && <p className="oa-notice" role="status">Gerando com {assistantProviders[pendingProvider]}…</p>}
          {retryForConversation && !pendingId && <div className="oa-retry">
            <p>Tentar novamente envia a pergunta{retryForConversation.input.learning ? ' e o conteúdo da etapa' : ''}{retryForConversation.input.learningConsent ? ', junto ao seu progresso e tentativas' : ''}{retryForConversation.input.contextConsent ? ', com ' + (retryForConversation.input.learning ? 'trechos das suas anotações' : 'dados de estudo e trechos das fontes') : ''}{retryForConversation.input.history.length ? ' e o histórico desta conversa' : ''} para {assistantProviders[alternate]}.
              {retryForConversation.input.contextConsent && alternate !== 'gemini' && ' O Gemini recebe a pergunta para localizar fontes.'}
              {alternate === 'openrouter' && ' O OpenRouter encaminha a solicitação à hospedagem do modelo.'}
            </p>
            <label className="oa-control"><span className="sr-only">Provedor para nova tentativa</span>
              <select value={alternate} onChange={(event) => { if (isAssistantProvider(event.target.value)) setAlternate(event.target.value) }}>
                {assistantProviderIds.filter((id) => id !== retryForConversation.input.model)
                  .map((id) => <option key={id} value={id}>{assistantProviders[id]}</option>)}
              </select><ChevronDown size={15} aria-hidden="true" />
            </label>
            <button type="button" className="oa-button" onClick={() => setRetry(null)}>Dispensar</button>
            <button type="button" className="oa-button oa-primary" onClick={retryReply}>Autorizar e tentar</button>
          </div>}
          {learning && <div className="oa-learning-actions">
            {learning.mode === 'hint' && nextHint && <button type="button" className="oa-button oa-primary" disabled={!!pendingId}
              onClick={() => { void ask(learningTutorQuestion('hint', nextHint), nextHint) }}>Pedir dica {nextHint} de 3</button>}
            {learning.mode === 'hint' && !nextHint && <p role="status">Você recebeu as três dicas desta conversa.</p>}
            {learning.mode === 'explain' && !messages.length && <button type="button" className="oa-button oa-primary" disabled={!!pendingId}
              onClick={() => { void ask(learningTutorQuestion('explain')) }}>Explicar assunto</button>}
            {learning.mode === 'explain-error' && <button type="button" className="oa-button oa-primary" disabled={!!pendingId || learningConsent !== provider}
              onClick={() => { void ask(learningTutorQuestion('explain-error')) }}>Explicar meu erro</button>}
            {pendingId && learning.mode !== 'explain' && <button type="button" className="oa-button" onClick={stopResponse}>Parar resposta</button>}
          </div>}
          {(!learning || learning.mode === 'explain') && <form className="oa-composer" onSubmit={(event) => { event.preventDefault(); void ask() }}>
            <button className="oa-icon" type="button" aria-label="Agendar prova" title="Agendar prova" onClick={() => openDialog({ kind: 'exam' })}><CalendarDays size={20} aria-hidden="true" /></button>
            <button className="oa-icon" type="button" aria-label={recording ? 'Parar ditado' : 'Ditar pergunta'} aria-pressed={recording} title="Ditar pergunta" onClick={toggleRecording}><Mic size={20} aria-hidden="true" /></button>
            <textarea ref={input} aria-label="Sua pergunta" placeholder="Escreva sua pergunta…" rows={1} maxLength={assistantQuestionLimit} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={composerKey} />
            {pendingId ? <button className="oa-icon oa-primary" type="button" aria-label="Parar resposta" onClick={stopResponse}><Square size={18} aria-hidden="true" /></button> :
              <button className="oa-icon oa-primary" type="submit" aria-label="Enviar pergunta" disabled={query.trim().length < 3}><Send size={19} aria-hidden="true" /></button>}
          </form>}
        </footer>
      </section>}

      <dialog ref={historyDialog} className="oa-native-dialog oa-history-dialog" aria-label="Histórico do Assistente">
        <AssistantHistory {...historyProps} close={() => historyDialog.current?.close()} />
      </dialog>
      <dialog ref={confirmDialog} className="oa-native-dialog" aria-labelledby="oa-dialog-title" onClose={() => setDialog(null)}
        onCancel={(event) => { if (savingExam) event.preventDefault() }}>
        {dialog && <form className="oa-confirm" onSubmit={confirm} aria-busy={savingExam}>
          <h2 id="oa-dialog-title">{dialogTitle}</h2>
          {dialog.kind === 'exam' ? <>
            <label>Título da prova<input name="title" required maxLength={120} /></label>
            <label>Data<input name="date" type="date" required /></label>
          </> : dialog.kind === 'rename' ? <label>Título<input name="title" required maxLength={80} defaultValue={dialog.conversation.title} /></label> :
            <p className="oa-muted">Excluir “{dialog.conversation.title}” deste navegador?</p>}
          {dialogError && <p role="alert" className="oa-error">{dialogError}</p>}
          <div className="oa-dialog-actions">
            <button className="oa-button" type="button" disabled={savingExam} onClick={() => confirmDialog.current?.close()}>Cancelar</button>
            <button className="oa-button oa-primary" type="submit" disabled={savingExam}>{savingExam ? 'Salvando…' : dialog.kind === 'exam' ? 'Confirmar agendamento' : dialog.kind === 'rename' ? 'Salvar título' : 'Excluir conversa'}</button>
          </div>
        </form>}
      </dialog>
    </div>
  )
}

export default function ChatPanel({ accountId, workspaces, initialWorkspaceId, onClose, learning, initialLearningLabel, academy }: ChatPanelProps) {
  const { identity, checked, availability } = useAssistantIdentity(accountId)
  const search = useSearchParams()
  const [workspaceChoice, setWorkspaceChoice] = useState<string>()
  const selectedWorkspace = learning ? search.get('tutorWorkspace') ?? '' : workspaceChoice ?? initialWorkspaceId ?? ''
  const workspaceId = workspaces.some((workspace) => workspace.id === selectedWorkspace) ? selectedWorkspace : ''

  if (!identity) return (
    <div className="oa-session" role="status">
      <div><h1>Conversar com a IA</h1><p>{checked ? 'Entre com sua conta para acessar o Assistente.' : 'Verificando a sessão…'}</p></div>
      {checked && <Link href="/login" className="oa-button oa-primary">Entrar</Link>}
      {onClose && <button type="button" className="oa-button" onClick={onClose}>Fechar Assistente</button>}
    </div>
  )
  if (availability !== 'ready') return (
    <div className="oa-session" role="status">
      <div>
        <h1>Conversar com a IA</h1>
        <p>{availability === 'assessment' ? openAssessmentTutorMessage : 'Não foi possível verificar o acesso ao Assistente. Abra novamente para tentar.'}</p>
      </div>
      {onClose ? <button type="button" className="oa-button" onClick={onClose}>Fechar Assistente</button>
        : <Link href={learningPath} className="oa-button" prefetch={false}>Voltar às trilhas</Link>}
    </div>
  )
  const scope = learning ? learningTutorHistoryScope(learning) : academy ? 'academy:' + academy.key : ''
  function changeWorkspace(value: string) {
    if (learning) {
      const search = writeLearningTutorSearch(new URLSearchParams(window.location.search), learning, value)
      window.history.replaceState(null, '', window.location.pathname + '?' + search)
    } else {
      setWorkspaceChoice(value)
    }
  }
  return <AssistantWorkspace key={assistantHistoryKey(identity.id, workspaceId) + ':' + scope} accountId={identity.id}
    firstName={identity.firstName} workspaceId={workspaceId} workspaces={workspaces} onWorkspaceChange={changeWorkspace}
    onClose={onClose} learning={learning} initialLearningLabel={initialLearningLabel} academy={academy} />
}
