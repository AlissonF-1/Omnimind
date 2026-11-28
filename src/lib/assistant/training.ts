export const trainingTopics = {
  backend: 'Backend · trilha mista',
  sql: 'SQL',
  git: 'Git',
  python: 'Python',
  api: 'APIs REST',
  redes: 'Redes',
} as const

export type TrainingTopic = keyof typeof trainingTopics
export type TrainingMode = 'quiz' | 'interview'
export type TrainingLevel = 1 | 2 | 3
export type TrainingAdaptation = 'reforçar' | 'manter' | 'avançar'
export type TrainingTurn = { questionId: string; answer: string; feedback: string; adaptation: TrainingAdaptation }
export type TrainingReport = { strengths: string; gaps: string; nextSteps: string }
export type TrainingSession = {
  mode: TrainingMode
  topic: TrainingTopic
  level: TrainingLevel
  turns: TrainingTurn[]
  pendingId?: string
  report?: TrainingReport
}

const bank = {
  sql: [
    'Como você filtraria pedidos ativos em uma consulta SQL? Explique onde entra o filtro.',
    'Para listar todos os clientes, inclusive aqueles sem pedidos, qual junção você usaria e por quê?',
    'Como você verificaria se uma junção está duplicando uma contagem por cliente?',
    'Quando você usaria HAVING em vez de WHERE? Dê um exemplo.',
  ],
  git: [
    'Qual é a diferença entre git add e git commit?',
    'Ao fazer merge de uma branch, você encontra um conflito. Como revisaria e confirmaria a resolução?',
    'Um commit com erro já está em uma branch compartilhada. Como desfaria a alteração e preservaria o histórico?',
    'Em que situação uma branch separada ajuda seu fluxo de trabalho?',
  ],
  python: [
    'Qual é a diferença entre uma lista e um dicionário em Python? Dê um uso para cada.',
    'Como trataria campos ausentes em registros recebidos de uma API em Python?',
    'Um processamento usa memória demais ao ler um arquivo grande. Como reorganizaria a leitura e verificaria o resultado?',
    'Como escreveria um teste pequeno para uma função que recebe uma lista vazia?',
  ],
  api: [
    'Qual é a diferença entre GET e POST em uma API REST?',
    'Como uma API deve responder quando um recurso está ausente e quando a sessão expirou?',
    'Uma chamada de criação foi reenviada após timeout. Como evitaria criar dois registros?',
    'Como você validaria os campos recebidos antes de persistir um recurso?',
  ],
  redes: [
    'O que o DNS faz quando você abre um site?',
    'Como você separaria um problema de DNS de uma falha no servidor ao diagnosticar um acesso?',
    'A conexão TCP foi estabelecida, mas a chamada HTTPS falha. Que verificações você faria a seguir?',
    'Onde entra o TCP quando uma aplicação faz uma requisição HTTP?',
  ],
} as const

export const trainingQuestions = Object.entries(bank).flatMap(([topic, questions]) =>
  questions.map((text, index) => ({ id: topic + '-' + index, topic, text, level: index === 3 ? 1 : index + 1 })))
export const trainingTurnLimit = 8
export const trainingAnswerLimit = 1600

export function isTrainingTopic(value: unknown): value is TrainingTopic {
  return typeof value === 'string' && Object.hasOwn(trainingTopics, value)
}

export function trainingQuestion(id: unknown, topic: TrainingTopic) {
  return trainingQuestions.find((question) => question.id === id &&
    (topic === 'backend' ? question.topic !== 'redes' : question.topic === topic))
}

export function nextTrainingQuestion(session: TrainingSession) {
  const used = new Set(session.turns.map(({ questionId }) => questionId))
  const last = session.turns.at(-1)
  const adjustment = last?.adaptation === 'avançar' ? 1 : last?.adaptation === 'reforçar' ? -1 : 0
  const level = Math.min(3, Math.max(1, session.level + adjustment)) as TrainingLevel
  const lastQuestion = last && trainingQuestion(last.questionId, session.topic)
  const focus = last?.adaptation === 'reforçar' ? lastQuestion?.topic : undefined
  const candidates = trainingQuestions.filter(({ id }) => !used.has(id) && trainingQuestion(id, session.topic))
  candidates.sort((a, b) => Number(b.topic === focus) - Number(a.topic === focus) ||
    Math.abs(a.level - level) - Math.abs(b.level - level) ||
    Number(a.topic === lastQuestion?.topic) - Number(b.topic === lastQuestion?.topic))
  return { question: session.turns.length < trainingTurnLimit ? candidates[0] : undefined, level }
}

function short(value: unknown, limit: number) {
  return typeof value === 'string' && value.trim() && value.length <= limit ? value.trim() : null
}

export function parseTrainingFeedback(value: unknown): Pick<TrainingTurn, 'feedback' | 'adaptation'> | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  const feedback = short(data.feedback, 2600)
  const adaptation = data.adaptation
  if (!feedback || (adaptation !== 'reforçar' && adaptation !== 'manter' && adaptation !== 'avançar')) return null
  return { feedback, adaptation }
}

export function parseTrainingReport(value: unknown): TrainingReport | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  const strengths = short(data.strengths, 1700)
  const gaps = short(data.gaps, 1700)
  const nextSteps = short(data.nextSteps, 1700)
  return strengths && gaps && nextSteps ? { strengths, gaps, nextSteps } : null
}

export function parseTrainingSession(value: unknown): TrainingSession | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  if ((data.mode !== 'quiz' && data.mode !== 'interview') || !isTrainingTopic(data.topic) ||
    (data.level !== 1 && data.level !== 2 && data.level !== 3) || !Array.isArray(data.turns) || data.turns.length > trainingTurnLimit) return null
  const turns: TrainingTurn[] = []
  for (const entry of data.turns) {
    const question = trainingQuestion(entry?.questionId, data.topic)
    const answer = short(entry?.answer, trainingAnswerLimit)
    const feedback = parseTrainingFeedback(entry)
    if (!question || !answer || !feedback || turns.some(({ questionId }) => questionId === question.id)) return null
    turns.push({ questionId: question.id, answer, ...feedback })
  }
  const pending = trainingQuestion(data.pendingId, data.topic)
  if (data.pendingId !== undefined && (!pending || turns.some(({ questionId }) => questionId === pending.id))) return null
  const report = data.report === undefined ? undefined : parseTrainingReport(data.report) ?? undefined
  return { mode: data.mode, topic: data.topic, level: data.level, turns, pendingId: pending?.id, report }
}

export function parseTrainingCommand(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  const session = parseTrainingSession(data.session)
  if (!session || session.report) return null
  if (data.intent === 'finish' && session.mode === 'interview' && session.turns.length) return { intent: 'finish' as const, session }
  const question = trainingQuestion(session.pendingId, session.topic)
  const answer = short(data.answer, trainingAnswerLimit)
  if (data.intent === 'answer' && question && answer && session.turns.length < trainingTurnLimit) return { intent: 'answer' as const, session, question, answer }
  return null
}
