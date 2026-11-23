import QuestionPractice from '@/components/questions/QuestionPractice'
import { QuestionEmptyState } from '@/components/questions/QuestionOverview'
import { isQuestionUuid } from '@/lib/questions/contracts'
import { historyHref, practiceHref, questionsPath } from '@/lib/questions/practice'
import { getLatestQuestionVersions, getPracticeQuestion, getQuestionCompetencies, getQuestionSession } from '@/lib/questions/server'

export const metadata = { title: 'Resolver questões · OmniMind' }

export default async function PracticePage({ searchParams }: {
  searchParams: Promise<{ assunto?: string | string[]; versao?: string | string[]; origem?: string | string[] }>
}) {
  const { assunto, versao, origem } = await searchParams
  const topicSlug = typeof assunto === 'string' ? assunto : undefined
  const fromHistory = origem === 'historico' || origem === 'erros'
  const finishHref = historyHref(origem === 'erros', 1, fromHistory ? topicSlug : undefined)
  const backHref = fromHistory ? finishHref : questionsPath
  const session = await getQuestionSession()
  const [competencies, versions] = await Promise.all([
    getQuestionCompetencies(session),
    fromHistory ? [] : getLatestQuestionVersions(session),
  ])

  const topic = competencies.find((entry) => entry.slug === topicSlug)
  const topicOrder = new Map(competencies.map(({ id }, index) => [id, index]))
  const queue = versions.filter((version) => !topicSlug || version.competency_id === topic?.id)
    .sort((a, b) => (topicOrder.get(a.competency_id) ?? 0) - (topicOrder.get(b.competency_id) ?? 0))
  const versionId = isQuestionUuid(versao) ? versao : versao === undefined ? queue[0]?.id : undefined
  const practice = versionId ? await getPracticeQuestion(session, versionId) : null

  if (!practice || (topicSlug && practice.version.competency_id !== topic?.id)) {
    return <div className="q-shell q-practice"><QuestionEmptyState title="Questão indisponível" description={versao ? 'Esta versão não está disponível para resolução.' : 'Ainda não há questões publicadas para o assunto selecionado.'} href={backHref} action={fromHistory ? 'Voltar ao histórico' : 'Voltar às questões'} /></div>
  }

  const index = queue.findIndex((version) => version.question_id === practice.version.question_id)
  const next = index >= 0 ? queue[index + 1] : undefined
  const competency = competencies.find(({ id }) => id === practice.version.competency_id)

  return <QuestionPractice key={practice.version.id} question={practice.version} options={practice.options} topic={competency?.name} position={index >= 0 ? index + 1 : 1} total={index >= 0 ? queue.length : 1} nextHref={next ? practiceHref(topicSlug, next.id) : null} backHref={backHref} finishHref={finishHref} />
}
