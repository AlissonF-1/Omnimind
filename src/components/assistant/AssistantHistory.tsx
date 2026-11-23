import { MessageSquare, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { AssistantConversation } from '@/lib/assistant/history'

const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

export type AssistantHistoryProps = {
  conversations: AssistantConversation[]
  activeId: string | undefined
  create: () => void
  select: (id: string) => void
  rename: (conversation: AssistantConversation) => void
  remove: (conversation: AssistantConversation) => void
  close?: () => void
}

export default function AssistantHistory({ conversations, activeId, create, select, rename, remove, close }: AssistantHistoryProps) {
  return (
    <div className="oa-history-content">
      <div className="oa-history-top">
        <button type="button" className="oa-button oa-primary" onClick={create}><Plus size={19} aria-hidden="true" /> Nova conversa</button>
        {close && <button className="oa-icon" type="button" onClick={close} aria-label="Fechar histórico"><X size={19} aria-hidden="true" /></button>}
      </div>
      <h2>Conversas recentes</h2>
      {conversations.length ? <ul className="oa-threads">
        {[...conversations].sort((a, b) => b.updatedAt - a.updatedAt).map((entry) => (
          <li key={entry.id} className="oa-thread" data-active={activeId === entry.id}>
            <button className="oa-thread-select" type="button" aria-current={activeId === entry.id || undefined} onClick={() => select(entry.id)}>
              <MessageSquare size={17} aria-hidden="true" />
              <span><strong title={entry.title}>{entry.title}</strong><small>{entry.updatedAt ? dateFormat.format(entry.updatedAt) : 'Conversa local'}</small></span>
            </button>
            <div className="oa-thread-actions">
              <button type="button" className="oa-icon" aria-label={'Renomear ' + entry.title} title="Renomear conversa" onClick={() => rename(entry)}><Pencil size={14} aria-hidden="true" /></button>
              <button type="button" className="oa-icon" aria-label={'Excluir ' + entry.title} title="Excluir conversa" onClick={() => remove(entry)}><Trash2 size={14} aria-hidden="true" /></button>
            </div>
          </li>
        ))}
      </ul> : <p className="oa-history-empty">Suas conversas desta conta aparecerão aqui.</p>}
    </div>
  )
}
