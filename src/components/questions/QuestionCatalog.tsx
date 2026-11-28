import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Braces, Database, Filter, GitMerge, Hash, History, Layers3, ListFilter, Terminal } from '@/components/icons'
import { historyHref, practiceHref } from '@/lib/questions/practice'
import type { Competency, QuestionStats } from '@/lib/questions/server'
import { QuestionEmptyState, QuestionStatsCards } from './QuestionOverview'

type CatalogTopic = Competency & { count: number; practiced: number | null }

const art = {
  'select-where': { icon: Database, tone: 'lavender', description: 'Projete colunas e filtre linhas.' },
  'and-or': { icon: Braces, tone: 'cyan', description: 'Combine condições e controle a precedência.' },
  join: { icon: GitMerge, tone: 'blue', description: 'Relacione registros entre tabelas.' },
  'group-by': { icon: Layers3, tone: 'green', description: 'Agrupe registros para criar resumos.' },
  having: { icon: Filter, tone: 'amber', description: 'Filtre resultados de uma agregação.' },
  'count-null': { icon: Hash, tone: 'coral', description: 'Conte registros e interprete valores ausentes.' },
}

export default function QuestionCatalog({ topics, total, practiced, stats }: {
  topics: CatalogTopic[]
  total: number
  practiced: number | null
  stats: QuestionStats | null
}) {
  return (
    <div className="q-shell q-stack">
      <header className="q-hero">
        <Image className="q-hero-image" src="/images/questoes/catalogo.webp" alt="" width={1400} height={700} preload unoptimized />
        <div className="q-hero-copy">
          <div className="q-eyebrow q-row"><Terminal size={15} aria-hidden="true" /> Fundamentos de SQL</div>
          <h1 className="q-title">Questões de SQL</h1>
          <p className="q-subtitle">Pratique consultas, entenda cada alternativa e acompanhe seu avanço por assunto.</p>
          <div className="q-row">
            {total > 0 && <Link href={practiceHref()} prefetch={false} className="q-button q-button-primary">Iniciar prática <ArrowRight size={16} aria-hidden="true" /></Link>}
            <Link href={historyHref()} prefetch={false} className="q-button"><History size={16} aria-hidden="true" /> Histórico</Link>
          </div>
        </div>
      </header>

      <QuestionStatsCards total={total} totalLabel="Questões praticadas" practiced={practiced} stats={stats} />

      <section aria-labelledby="question-topics">
        <h2 id="question-topics" className="q-section-title">Competências</h2>
        {topics.length === 0 ? (
          <div className="mt-4"><QuestionEmptyState title="Catálogo vazio" description="As competências e questões publicadas aparecerão aqui." /></div>
        ) : (
          <ul className="q-topic-grid">
            {topics.map((topic) => {
              const edition = Object.hasOwn(art, topic.slug) ? art[topic.slug as keyof typeof art] : null
              const Icon = edition?.icon ?? ListFilter
              const title = topic.name.replace(/^SQL\s*·\s*/, '')
              return (
                <li key={topic.id} className={'q-panel q-topic q-' + (edition?.tone ?? 'lavender')}>
                  <div className="q-cover" aria-hidden="true">
                    {edition && <Image className="q-cover-image" src={'/images/questoes/' + topic.slug + '.webp'} alt="" width={480} height={480} unoptimized />}
                    <span className="q-cover-icon"><Icon size={19} /></span>
                  </div>
                  <div className="q-topic-body">
                    <h3>{title}</h3>
                    {edition && <p>{edition.description}</p>}
                    <div className="q-coverage">
                      <div className="q-row q-between">
                        <p>{topic.count} {topic.count === 1 ? 'questão' : 'questões'}</p>
                        {topic.count > 0 && <p>{topic.practiced !== null ? topic.practiced + '/' + topic.count + ' praticadas' : 'Progresso indisponível'}</p>}
                      </div>
                      {topic.count > 0 && topic.practiced !== null && <progress className="q-progress" value={topic.practiced} max={topic.count} aria-label={'Questões praticadas em ' + title} />}
                    </div>
                    {topic.count > 0 && (
                      <Link href={practiceHref(topic.slug)} prefetch={false} aria-label={'Praticar ' + title} className="q-button">
                        {topic.practiced === topic.count ? 'Praticar de novo' : 'Praticar'}
                        <ArrowRight size={16} aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
