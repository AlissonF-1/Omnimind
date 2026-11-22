import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, BrainCircuit, CalendarDays, FolderPlus, ListChecks, NotebookPen, Sparkles, Zap } from 'lucide-react'
import StudyCompanion from '@/components/StudyCompanion'

const steps = [
  { title: 'Crie um workspace', description: 'Organize sua matéria no menu lateral.', icon: FolderPlus },
  { title: 'Registre uma nota', description: 'Guarde conceitos e exemplos do que estudou.', icon: NotebookPen },
  { title: 'Gere flashcards', description: 'Transforme os pontos principais em perguntas.', icon: Sparkles },
  { title: 'Faça a primeira revisão', description: 'Responda aos cartões para iniciar seu histórico.', icon: BrainCircuit },
]

export function DashboardHero({ greeting, date, dayImage, streak }: {
  greeting: string
  date: string
  dayImage: string
  streak: number
}) {
  return (
    <header className="dh-hero">
      <div className="dh-hero-art" aria-hidden="true">
        <Image src="/images/brain_workspace_3d.jpg" alt="" fill sizes="(max-width: 640px) 75vw, 580px" preload />
      </div>
      <div className="dh-hero-copy">
        <div className="dh-row">
          <span className="dh-day-image"><Image src={dayImage} alt="" width={29} height={29} /></span>
          <span className="dh-hero-date">{date}</span>
        </div>
        <h1>{greeting}.</h1>
        <p className="dh-caption">Revise seus flashcards, pratique questões e acompanhe seu ritmo de estudo.</p>
        <nav aria-label="Atalhos do painel" className="dh-row dh-hero-actions">
          <Link href="/dashboard/questoes" prefetch={false} className="dh-button dh-button-primary">
            <ListChecks size={16} aria-hidden="true" /> Praticar questões <ArrowRight size={15} aria-hidden="true" />
          </Link>
          <Link href="/dashboard/calendario" className="dh-button"><CalendarDays size={16} aria-hidden="true" /> Calendário</Link>
        </nav>
      </div>
      <div className="dh-companion">
        <span>Companheiro de estudo</span>
        <StudyCompanion streak={streak} />
      </div>
    </header>
  )
}

function estimatedReviewTime(count: number) {
  const minutes = Math.round((count * 45) / 60)
  return minutes < 1 ? 'menos de 1 min' : minutes + ' min'
}

export function DashboardReviewFocus({ overdueCards, totalCards }: { overdueCards: number; totalCards: number }) {
  const hasOverdue = overdueCards > 0
  const headline = hasOverdue
    ? overdueCards + (overdueCards === 1 ? ' card pendente' : ' cards pendentes')
    : totalCards > 0 ? 'Sem cards pendentes' : 'Prepare sua primeira revisão'

  return (
    <article className="dh-panel dh-pad dh-review">
      <div className="dh-review-image" aria-hidden="true">
        <Image src="/images/review_target_3d.jpg" alt="" fill sizes="(max-width: 640px) 48vw, 300px" />
      </div>
      <p className="dh-eyebrow">Revisão ativa</p>
      <h3>{headline}</h3>
      <p className="dh-caption">
        {hasOverdue
          ? 'Sessão estimada em ' + estimatedReviewTime(overdueCards) + '.'
          : totalCards > 0
            ? 'Abra sua fila para escolher o próximo foco de revisão.'
            : 'Crie flashcards a partir de uma nota para começar a revisar.'}
      </p>
      <Link href="/dashboard/revisoes" className="dh-button">
        {hasOverdue ? 'Revisar agora' : 'Abrir revisões'} <ArrowRight size={15} aria-hidden="true" />
      </Link>
    </article>
  )
}

export function DashboardEmptyActivity({ showOnboarding }: { showOnboarding: boolean }) {
  return (
    <article className="dh-panel dh-pad">
      <div className="dh-row">
        <Image className="dh-empty-art shrink-0" src="/images/empty_state_astronaut.png" alt="" width={68} height={68} />
        <div className="min-w-0">
          <h3 className="dh-title">Consistência de estudos</h3>
          <p className="dh-caption">Sua primeira revisão aparece aqui e inicia o mapa de atividade.</p>
        </div>
      </div>
      {showOnboarding && (
        <>
          <h4 className="dh-eyebrow mt-4">Como começar</h4>
          <ol className="dh-onboarding">
            {steps.map(({ title, description, icon: Icon }) => (
              <li key={title}>
                <span className="dh-icon"><Icon size={17} aria-hidden="true" /></span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="dh-caption !text-xs">{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </article>
  )
}

export function DashboardUltimatum() {
  return (
    <article className="dh-panel dh-pad dh-ultimatum">
      <div className="dh-row">
        <span className="dh-icon dh-danger"><Zap size={17} aria-hidden="true" /></span>
        <h3 className="dh-title">Modo Ultimato</h3>
      </div>
      <p className="dh-caption mt-2">Quiz com cards dos próximos 15 dias, a partir dos menos estáveis.</p>
      <Link href="/dashboard/revisoes?mode=ultimato" className="dh-button">
        Iniciar Ultimato <ArrowRight size={15} aria-hidden="true" />
      </Link>
    </article>
  )
}
