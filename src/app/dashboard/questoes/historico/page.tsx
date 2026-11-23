import { redirect } from 'next/navigation'
import QuestionHistory from '@/components/questions/QuestionHistory'
import { historyHref } from '@/lib/questions/practice'
import { getQuestionCompetencies, getQuestionHistory, getQuestionSession, getQuestionStats, getRecentQuestionPerformance, questionHistoryPageSize } from '@/lib/questions/server'

export const metadata = { title: 'Histórico de questões · OmniMind' }

export default async function HistoryPage({ searchParams }: {
  searchParams: Promise<{ filtro?: string | string[]; pagina?: string | string[]; assunto?: string | string[] }>
}) {
  const { filtro, pagina, assunto } = await searchParams
  const errorsOnly = filtro === 'erros'
  const page = typeof pagina === 'string' && /^[1-9]\d{0,5}$/.test(pagina) ? Number(pagina) : 1
  const session = await getQuestionSession()
  const topics = await getQuestionCompetencies(session)
  const topic = topics.find(({ slug }) => slug === assunto)
  const [history, stats, performance] = await Promise.all([
    getQuestionHistory(session, errorsOnly, page, topic?.id),
    getQuestionStats(session),
    getRecentQuestionPerformance(session),
  ])

  const totalPages = Math.max(1, Math.ceil(history.count / questionHistoryPageSize))
  if (page > totalPages) redirect(historyHref(errorsOnly, totalPages, topic?.slug))

  return <QuestionHistory attempts={history.attempts} stats={stats} performance={performance} topics={topics} topicSlug={topic?.slug} errorsOnly={errorsOnly} page={page} totalPages={totalPages} count={history.count} />
}
