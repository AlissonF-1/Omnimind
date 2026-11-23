import Image from 'next/image'
import { ArrowUpRight, BookOpen, Check, CircleHelp, FileText, Flame, GraduationCap, Layers, Smile } from 'lucide-react'
import type { AssistantPersona } from '@/lib/assistant/contracts'

export const assistantPersonas = [
  { id: 'tutor', title: 'Tutor Socrático', description: 'Guia seu raciocínio com analogias e perguntas.', icon: GraduationCap },
  { id: 'grill', title: 'Examinador', description: 'Desafia seu conhecimento com perguntas e feedback.', icon: Flame },
  { id: 'eli5', title: 'Simplificado', description: 'Explica conceitos com exemplos fáceis de lembrar.', icon: Smile },
] as const

const suggestions = [
  { title: 'Tire uma dúvida', description: 'Escolha o conceito que quer entender.', question: 'Explique um conceito importante das minhas notas de forma simples.', icon: CircleHelp },
  { title: 'Analise minhas anotações', description: 'Encontre lacunas e contradições.', question: 'Analise minhas notas e aponte possíveis lacunas e contradições.', icon: FileText },
  { title: 'Pratique com perguntas', description: 'Teste sua memória durante a conversa.', question: 'Faça uma pergunta desafiadora sobre as minhas anotações.', icon: Layers },
  { title: 'Resuma o conteúdo', description: 'Relembre os pontos principais.', question: 'Resuma o conteúdo mais importante das minhas anotações de estudo.', icon: BookOpen },
]

export default function AssistantWelcome({ name, persona, setPersona, ask }: {
  name: string
  persona: AssistantPersona
  setPersona: (persona: AssistantPersona) => void
  ask: (question: string) => void
}) {
  return (
    <div className="oa-welcome">
      <section className="oa-hero" aria-labelledby="oa-greeting">
        <div className="oa-hero-visual" aria-hidden="true">
          <Image src="/images/dashboard/brain.webp" alt="" fill sizes="(max-width: 650px) 45vw, 420px" loading="eager" />
        </div>
        <div className="oa-hero-copy">
          <p className="oa-kicker">Assistente de estudos OmniMind</p>
          <h2 id="oa-greeting">Olá, <span>{name}.</span></h2>
          <p className="oa-hero-question">Como posso ajudar no seu estudo hoje?</p>
          <p className="oa-muted">Tire dúvidas, revise suas anotações e pratique no seu ritmo.</p>
        </div>
      </section>
      <fieldset className="oa-personas">
        <legend className="sr-only">Estilo da resposta</legend>
        <div className="oa-persona-grid">
          {assistantPersonas.map(({ id, title, icon: Icon, description }) => (
            <button key={id} type="button" className="oa-persona" aria-pressed={persona === id} onClick={() => setPersona(id)}>
              <span className="oa-persona-icon"><Icon size={22} aria-hidden="true" /></span>
              <span><strong>{title}</strong><span className="oa-persona-description">{description}</span></span>
              {persona === id && <span className="oa-chosen"><Check size={13} aria-hidden="true" /></span>}
            </button>
          ))}
        </div>
      </fieldset>
      <section className="oa-starters" aria-labelledby="oa-suggestions">
        <h3 id="oa-suggestions">Sugestões para começar</h3>
        <div className="oa-starter-grid">
          {suggestions.map(({ title, description, question, icon: Icon }) => (
            <button type="button" key={title} className="oa-starter" onClick={() => ask(question)}>
              <span className="oa-starter-icon"><Icon size={19} aria-hidden="true" /></span>
              <span><strong>{title}</strong><small>{description}</small></span>
              <ArrowUpRight className="oa-starter-arrow" size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
