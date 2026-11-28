'use client'

import { BookOpen, Lightbulb, MessageCircleQuestion } from '@/components/icons'

export type LearningTutorScope = {
  pathId: string
  stepId: string
  label: { pathTitle: string; stepTitle: string; slug: string }
}

const actions = {
  hint: { icon: Lightbulb, label: 'Pedir uma dica' },
  explain: { icon: BookOpen, label: 'Explicar assunto' },
  'explain-error': { icon: MessageCircleQuestion, label: 'Explicar meu erro' },
}

export function LearningTutorButton({ scope, mode, attemptId }: {
  scope: LearningTutorScope
} & ({ mode: 'hint' | 'explain'; attemptId?: never } | { mode: 'explain-error'; attemptId: string })) {
  const { icon: Icon, label } = actions[mode]
  return (
    <button type="button" className="lp-button lp-tutor-button" aria-haspopup="dialog"
      onClick={() => window.dispatchEvent(new CustomEvent('open-chat', {
        detail: { ...scope, mode, ...(attemptId ? { attemptId } : {}) },
      }))}
    >
      <Icon size={17} aria-hidden="true" />{label}
    </button>
  )
}

export function LearningTutorActions({ scope }: { scope: LearningTutorScope }) {
  return (
    <div className="lp-tutor" role="group" aria-label="Assistente da etapa">
      <strong>Assistente da etapa</strong>
      <LearningTutorButton scope={scope} mode="hint" />
      <LearningTutorButton scope={scope} mode="explain" />
    </div>
  )
}
