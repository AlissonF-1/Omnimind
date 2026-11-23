'use client'

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, ChevronDown, History, Layers, MessageSquare, Mic, Send, Settings, Square, X } from 'lucide-react'
import { confirmAssistantExamAction } from '@/actions/chat'
import { useSettings } from '@/contexts/SettingsContext'
import { assistantHistoryKey, assistantPath, isAssistantPersona, type AssistantPersona } from '@/lib/assistant/contracts'
import {
  assistantDisplayText, assistantMessageId, assistantTitle, emptyAssistantHistory, limitAssistantMessages,
  newAssistantConversation, newConversationTitle, parseAssistantSources, readAssistantHistory, saveAssistantHistory,
  type AssistantConversation, type AssistantMessage as Message,
} from '@/lib/assistant/history'
import { getBestVoice } from '@/utils/audio'
import AssistantHistory from './assistant/AssistantHistory'
import AssistantMessage from './assistant/AssistantMessage'
import AssistantWelcome, { assistantPersonas } from './assistant/AssistantWelcome'
import { useAssistantIdentity } from './assistant/useAssistantIdentity'
import './assistant/assistant.css'

type Workspace = { id: string; name: string }

type ChatPanelProps = {
  accountId: string
  workspaces: Workspace[]
  initialWorkspaceId?: string
  onClose?: () => void
}

type Dialog = { kind: 'exam' } | { kind: 'rename' | 'delete'; conversation: AssistantConversation }
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

function AssistantWorkspace({ accountId, workspaceId, workspaces, onWorkspaceChange, firstName, onClose }: {
  accountId: string
  workspaceId: string
  workspaces: Workspace[]
  onWorkspaceChange: (value: string) => void
  firstName: string
  onClose?: () => void
}) {
  const { settings } = useSettings()
  const pathname = usePathname()
  const storageKey = assistantHistoryKey(accountId, workspaceId)
  const [state, setState] = useState(() => {
    try { return readAssistantHistory(window.sessionStorage, storageKey) }
    catch { return emptyAssistantHistory() }
  })
  const [defaultPersona, setDefaultPersona] = useState<AssistantPersona>('tutor')
  const [query, setQuery] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
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
  const assistantConversation = state.conversations.find(({ id }) => id === state.activeConversationId)
  const messages = assistantConversation?.messages ?? []
  const persona = assistantConversation?.persona ?? defaultPersona

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

  function selectConversation(id: string) {
    setState((current) => ({ ...current, activeConversationId: id }))
    setQuery('')
    setCopiedId(null)
    historyDialog.current?.close()
    if (scroll.current) scroll.current.scrollTop = 0
  }

  function startConversation() {
    const entry = newAssistantConversation('tutor')
    setState((current) => ({ conversations: [entry, ...current.conversations], activeConversationId: entry.id }))
    setQuery('')
    setNotice('')
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
    setState((current) => ({
      ...current,
      conversations: current.conversations.map((entry) => ({
        ...entry,
        messages: entry.messages.filter(({ id, content }) => id !== pendingId || content.trim()),
      })),
    }))
  }

  async function ask(value = query) {
    const question = value.trim()
    if (request.current || question.length < 3) return
    const conversation = assistantConversation ?? newAssistantConversation(persona)
    const messageId = assistantMessageId()
    const userMessage: Message = { id: assistantMessageId(), role: 'user', content: question }
    const placeholder: Message = { id: messageId, role: 'ai', content: '' }
    const controller = new AbortController()
    request.current = controller
    setPendingId(messageId)
    setQuery('')
    setNotice('')
    setState((current) => {
      const next = {
        ...conversation,
        title: conversation.messages.length === 0 && conversation.title === newConversationTitle ? assistantTitle(question) : conversation.title,
        messages: limitAssistantMessages([...conversation.messages, userMessage, placeholder]),
        updatedAt: Date.now(),
      }
      return { conversations: [next, ...current.conversations.filter(({ id }) => id !== next.id)], activeConversationId: next.id }
    })

    function changeMessage(update: Partial<Message>) {
      updateConversation(conversation.id, (entry) => ({
        ...entry,
        messages: entry.messages.map((message) => message.id === messageId ? { ...message, ...update } : message),
      }))
    }

    try {
      const result = await fetch('/api/chat', {
        method: 'POST', cache: 'no-store', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId, question, workspaceId: workspaceId || null, persona, contextRoute: pathname,
          history: conversation.messages.filter((message) => message.content && !message.error)
            .map(({ role, content }) => ({ role, content })),
          ecoMode: settings.eco_mode, model: settings.ai_default_model,
        }),
      })
      if (!result.ok) {
        const data = await result.json().catch(() => null)
        if (result.status === 401 || result.status === 409) window.dispatchEvent(new Event('assistant-session-invalid'))
        changeMessage({ content: typeof data?.error === 'string' ? data.error : 'Não foi possível enviar a pergunta.', error: true })
        return
      }
      if (!result.body) throw new Error('Resposta vazia.')
      const reader = result.body.pipeThrough(new TextDecoderStream()).getReader()
      let answer = ''
      let buffer = ''
      function readLine(line: string) {
        if (!line.trim()) return
        const event = JSON.parse(line)
        switch (event.type) {
          case 'text':
            if (typeof event.data === 'string') {
              answer += event.data
              changeMessage({ content: assistantDisplayText(answer) })
            }
            break
          case 'sources':
            changeMessage({ sources: parseAssistantSources(event.data) })
            break
          case 'error':
            throw new Error(typeof event.data === 'string' ? event.data : 'Resposta interrompida.')
          case 'level-up':
          case 'achievement-unlocked':
            window.dispatchEvent(new CustomEvent(event.type, { detail: event.data }))
        }
      }
      try {
        while (request.current === controller && !controller.signal.aborted) {
          const { value: chunk, done } = await reader.read()
          if (controller.signal.aborted || request.current !== controller) break
          if (done) {
            readLine(buffer)
            if (!assistantDisplayText(answer)) throw new Error('O Assistente retornou uma resposta vazia.')
            break
          }
          const lines = (buffer + chunk).split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) readLine(line)
        }
      } finally {
        await reader.cancel().catch(() => null)
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        changeMessage({ content: error instanceof Error && error.message === 'O Assistente retornou uma resposta vazia.'
          ? error.message : 'A resposta foi interrompida. Envie a pergunta novamente.', error: true })
      }
    } finally {
      if (request.current === controller) {
        request.current = null
        setPendingId(null)
      }
    }
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
        return { conversations, activeConversationId: current.activeConversationId === id ? conversations[0]?.id ?? null : current.activeConversationId }
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
        <button className="oa-icon oa-history-toggle" type="button" aria-label="Abrir histórico" onClick={() => historyDialog.current?.showModal()}><History size={20} aria-hidden="true" /></button>
        <Link href="/dashboard/configuracoes" prefetch={false} className="oa-icon" aria-label="Configurações do OmniMind" title="Configurações" onClick={onClose}><Settings size={19} aria-hidden="true" /></Link>
        {onClose && <button className="oa-icon" type="button" aria-label="Fechar Assistente" onClick={onClose}><X size={21} aria-hidden="true" /></button>}
      </header>

      <aside className="oa-history" aria-label="Histórico do Assistente"><AssistantHistory {...historyProps} /></aside>
      <section className="oa-chat" aria-label="Conversa">
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
          {onClose && <Link href={assistantPath} className="oa-open-page" prefetch={false} onClick={onClose}>Abrir página</Link>}
        </div>
        <div className="oa-scroll" ref={scroll}>
          {messages.length ? (
            <div className="oa-messages">
              {messages.map((message) => <AssistantMessage key={message.id} message={message} pending={pendingId === message.id}
                copied={copiedId === message.id} copy={() => { void copy(message) }} speak={() => speak(message.content)} />)}
            </div>
          ) : <AssistantWelcome name={firstName} persona={persona} setPersona={changePersona} ask={(text) => { void ask(text) }} />}
        </div>
        <footer className="oa-footer">
          {notice && <p className="oa-notice" role="status">{notice}</p>}
          <form className="oa-composer" onSubmit={(event) => { event.preventDefault(); void ask() }}>
            <button className="oa-icon" type="button" aria-label="Agendar prova" title="Agendar prova" onClick={() => openDialog({ kind: 'exam' })}><CalendarDays size={20} aria-hidden="true" /></button>
            <button className="oa-icon" type="button" aria-label={recording ? 'Parar ditado' : 'Ditar pergunta'} aria-pressed={recording} title="Ditar pergunta" onClick={toggleRecording}><Mic size={20} aria-hidden="true" /></button>
            <textarea ref={input} aria-label="Sua pergunta" placeholder="Escreva sua pergunta…" rows={1} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={composerKey} />
            {pendingId ? <button className="oa-icon oa-primary" type="button" aria-label="Parar resposta" onClick={stopResponse}><Square size={18} aria-hidden="true" /></button> :
              <button className="oa-icon oa-primary" type="submit" aria-label="Enviar pergunta" disabled={query.trim().length < 3}><Send size={19} aria-hidden="true" /></button>}
          </form>
        </footer>
      </section>

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

export default function ChatPanel({ accountId, workspaces, initialWorkspaceId, onClose }: ChatPanelProps) {
  const { identity, checked } = useAssistantIdentity(accountId)
  const [selectedWorkspace, setSelectedWorkspace] = useState(initialWorkspaceId ?? '')
  const workspaceId = workspaces.some((workspace) => workspace.id === selectedWorkspace) ? selectedWorkspace : ''

  if (!identity) return (
    <div className="oa-session" role="status">
      <div><h1>Conversar com a IA</h1><p>{checked ? 'Entre com sua conta para acessar o Assistente.' : 'Verificando a sessão…'}</p></div>
      {checked && <Link href="/login" className="oa-button oa-primary">Entrar</Link>}
      {onClose && <button type="button" className="oa-button" onClick={onClose}>Fechar Assistente</button>}
    </div>
  )
  return <AssistantWorkspace key={assistantHistoryKey(identity.id, workspaceId)} accountId={identity.id}
    firstName={identity.firstName} workspaceId={workspaceId} workspaces={workspaces} onWorkspaceChange={setSelectedWorkspace} onClose={onClose} />
}
