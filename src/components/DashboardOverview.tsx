import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, FlashcardsIcon, FolderPlus, NotesIcon, QuestionsIcon, ReviewsIcon, StudyPlanIcon } from '@/components/icons'
import StudyCompanion from '@/components/StudyCompanion'
import DashboardAssistantTeaser from '@/components/DashboardAssistantTeaser'

const steps = [
  { title: 'Crie um workspace', description: 'Organize sua matéria no menu lateral.', icon: FolderPlus },
  { title: 'Registre uma nota', description: 'Guarde conceitos e exemplos do que estudou.', icon: NotesIcon },
  { title: 'Gere flashcards', description: 'Transforme os pontos principais em perguntas.', icon: FlashcardsIcon },
  { title: 'Faça a primeira revisão', description: 'Responda aos cartões para iniciar seu histórico.', icon: ReviewsIcon },
]

export function DashboardHero({ greeting, date }: {
  greeting: string
  date: string
}) {
  return (
    <header className="dh-hero">
      <div className="dh-hero-art" aria-hidden="true">
        <Image src="/images/dashboard/brain.webp" alt="" fill sizes="(max-width: 640px) 65vw, 640px" preload />
      </div>
      <div className="dh-hero-copy">
        <div className="dh-row">
          <StudyPlanIcon size={16} aria-hidden="true" />
          <span className="dh-hero-date">{date}</span>
        </div>
        <h1>{greeting}, estudioso! <span aria-hidden="true">👋</span></h1>
        <p className="dh-caption">Revise seus flashcards, pratique questões e acompanhe seu ritmo de estudo.</p>
        <nav aria-label="Atalhos do painel" className="dh-row dh-hero-actions">
          {/* A rota de Questões exige navegação de documento para respeitar o cache offline. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/dashboard/questoes" className="dh-button dh-button-primary">
            <QuestionsIcon size={17} aria-hidden="true" /> Praticar questões <ArrowRight size={15} aria-hidden="true" />
          </a>
          <Link href="/dashboard/calendario" className="dh-button"><StudyPlanIcon size={17} aria-hidden="true" /> Planejar estudo</Link>
        </nav>
      </div>
      <DashboardAssistantTeaser />
    </header>
  )
}

export function DashboardCompanion({ streak }: { streak: number }) {
  return (
    <article className="dh-panel dh-pad dh-companion-card">
      <div><h3 className="dh-title">Companheiro de estudo</h3><p className="dh-caption">O Golem evolui conforme sua sequência de revisões.</p></div>
      <StudyCompanion streak={streak} />
    </article>
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
        <Image src="/images/dashboard/review-cards.webp" alt="" fill sizes="(max-width: 640px) 48vw, 300px" />
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
        <ReviewsIcon size={17} aria-hidden="true" /> {hasOverdue ? 'Revisar agora' : 'Abrir revisões'} <ArrowRight size={15} aria-hidden="true" />
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
