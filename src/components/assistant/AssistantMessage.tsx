import { memo } from 'react'
import Link from 'next/link'
import { BookOpen, Check, Copy, LoaderCircle, Sparkles, User, Volume2 } from '@/components/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { assistantSourceHref } from '@/lib/assistant/contracts'
import type { AssistantMessage as Message } from '@/lib/assistant/history'
import { assistantProviders } from '@/lib/assistant/providers'

const Markdown = memo(function Markdown({ value }: { value: string }) {
  return <ReactMarkdown skipHtml disallowedElements={['img']} remarkPlugins={[remarkGfm]}
    components={{ a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}>
    {value}
  </ReactMarkdown>
})

export default function AssistantMessage({ message, pending, copied, copy, speak }: {
  message: Message
  pending: boolean
  copied: boolean
  copy: () => void
  speak: () => void
}) {
  const assistant = message.role === 'ai'
  const generation = assistant ? message.generation : undefined
  const links = new Map<string, string>()
  for (const source of message.sources ?? []) {
    const href = assistantSourceHref(source)
    if (href && !links.has(href)) links.set(href, source.title || 'Fonte de estudo')
  }
  return (
    <article className="oa-message" data-role={message.role}>
      <div className="oa-message-avatar">{assistant ? <Sparkles size={18} aria-hidden="true" /> : <User size={18} aria-hidden="true" />}</div>
      <div className="oa-message-body">
        <p className="oa-message-label">{assistant ? 'OmniMind' : 'Você'}
          {generation && <span className="oa-generation-meta">
            {' · '}{assistantProviders[generation.provider]}
            {generation.model && ' · ' + generation.model}
            {!generation.model && !pending && ' · Modelo não informado'}
            {generation.upstreamProvider && ' · ' + generation.upstreamProvider}
          </span>}
        </p>
        {message.error ? <p role="alert" className="oa-error">{message.content}</p> : assistant ? (
          message.content ? <div className="oa-markdown"><Markdown value={message.content} /></div> :
            pending ? <p className="oa-thinking" role="status"><LoaderCircle className="motion-safe:animate-spin" size={15} aria-hidden="true" /> Preparando a resposta…</p> : null
        ) : <p className="oa-user-text">{message.content}</p>}
        {message.interruption && <p role="alert" className="oa-error">{message.interruption}</p>}
        {!!links.size && !message.error && <ul className="oa-sources" aria-label="Fontes consultadas">
          {[...links].map(([href, label]) => <li key={href}><Link href={href} prefetch={false}><BookOpen size={15} aria-hidden="true" />{label}</Link></li>)}
        </ul>}
        {assistant && message.content && !message.error && !pending && (
          <div className="oa-message-actions">
            <button className="oa-icon" type="button" onClick={copy} aria-label={copied ? 'Resposta copiada' : 'Copiar resposta'} title="Copiar resposta">{copied ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}</button>
            <button className="oa-icon" type="button" onClick={speak} aria-label="Ler resposta em voz alta" title="Ler em voz alta"><Volume2 size={17} aria-hidden="true" /></button>
          </div>
        )}
      </div>
    </article>
  )
}
