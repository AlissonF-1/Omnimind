import QuestionCatalog from '@/components/questions/QuestionCatalog'
import { QuestionEmptyState } from '@/components/questions/QuestionOverview'
import { QuestionSchemaUnavailableError, getLatestQuestionVersions, getPracticedVersions, getQuestionCompetencies, getQuestionSession, getQuestionStats } from '@/lib/questions/server'

export const metadata = { title: 'Questões · OmniMind' }

export default async function QuestionsPage() {
  const session = await getQuestionSession()
  const catalog = await Promise.all([
    getQuestionCompetencies(session),
    getLatestQuestionVersions(session),
    getQuestionStats(session),
  ]).catch((error: unknown) => {
    if (!(error instanceof QuestionSchemaUnavailableError)) throw error
    return null
  })

  if (!catalog) {
    return (
      <div className="q-shell">
        <QuestionEmptyState
          title="Catálogo indisponível neste ambiente"
          description={process.env.NODE_ENV === 'development'
            ? 'O Supabase configurado não encontrou as tabelas de Questões. Confira as migrations da OMNI-QUEST-001A no projeto de teste.'
            : 'O catálogo ainda não está disponível. Tente novamente mais tarde.'}
        />
      </div>
    )
  }

  const [competencies, versions, stats] = catalog
  const practiced = await getPracticedVersions(session, versions)
  const counts = new Map<string, { count: number; practiced: number }>()
  for (const version of versions) {
    const topic = counts.get(version.competency_id) ?? { count: 0, practiced: 0 }
    topic.count += 1
    if (practiced?.has(version.id)) topic.practiced += 1
    counts.set(version.competency_id, topic)
  }

  const topics = competencies.map((topic) => ({
    ...topic,
    count: counts.get(topic.id)?.count ?? 0,
    practiced: practiced ? counts.get(topic.id)?.practiced ?? 0 : null,
  }))

  return <QuestionCatalog topics={topics} total={versions.length} practiced={practiced?.size ?? null} stats={stats} />
}
