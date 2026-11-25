import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import * as react from 'react'
import * as jsx from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import { Blocks, MessagesSquare } from 'lucide-react'
import ts from 'typescript'
import * as training from '../../src/lib/assistant/training.ts'
import * as catalog from '../../src/lib/sql-lab/catalog.ts'
import * as contracts from '../../src/lib/assistant/contracts.ts'
import * as providers from '../../src/lib/assistant/providers.ts'

const userA = '00000000-0000-4000-8000-000000000001'
const userB = '00000000-0000-4000-8000-000000000002'
const attemptId = '00000000-0000-4000-8000-000000000003'
const feedback = { feedback: 'Dê um exemplo de filtro e explique o predicado.', adaptation: 'reforçar' }
const report = { strengths: 'Deu exemplos.', gaps: 'Rever filtros.', nextSteps: 'Pratique com dois predicados.' }

function load(path, stubs) {
  const source = readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { fileName: path,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  new Function('exports', 'require', outputText)(exports, (name) => {
    assert.ok(name in stubs, 'Dependência não simulada: ' + name)
    return stubs[name]
  })
  return exports
}

function fixture() {
  let user = userA
  let locked = false
  let outcome = feedback
  const calls = []
  const attempts = new Map()
  class GenerationError extends Error {}
  class SqlLabDataError extends Error {
    constructor(reason) { super(reason); this.reason = reason }
  }
  const request = load('src/lib/assistant/study-request.ts', {
    'server-only': {},
    '@/utils/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: user ? { id: user } : null } }) } }) },
    './contracts': contracts, './generation': { GenerationError }, './providers': providers,
    './learning-context': { hasOpenAssistantAssessment: async () => locked },
    './learning-tutor': { openAssessmentTutorMessage: 'Avaliação aberta' },
  })
  const modules = {
    '@/lib/assistant/contracts': contracts, '@/lib/assistant/training': training,
    '@/lib/assistant/study-request': request,
    '@/lib/assistant/generation': { async generateText(input) {
      calls.push(input)
      return { content: typeof outcome === 'string' ? outcome : JSON.stringify(outcome), metadata: { provider: input.provider, model: 'modelo-simulado' } }
    } },
    '@/lib/sql-lab/catalog': catalog,
    '@/lib/sql-lab/server': {
      SqlLabDataError,
      async saveSqlLabAttempt(_db, owner, slug, id, submission) {
        const key = owner + ':' + slug + ':' + id
        if (!attempts.has(key)) attempts.set(key, { id, submission, formative_feedback: null })
        const attempt = attempts.get(key)
        if (attempt.submission !== submission) throw new SqlLabDataError('conflict')
        return attempt
      },
      async getSqlLabAttempt(_db, owner, slug, id) { return attempts.get(owner + ':' + slug + ':' + id) },
      async saveSqlLabFeedback(_db, owner, slug, id, content) {
        const attempt = attempts.get(owner + ':' + slug + ':' + id)
        attempt.formative_feedback = content
        return attempt
      },
    },
  }
  const trainer = load('src/app/api/assistant/training/route.ts', modules)
  const lab = load('src/app/api/assistant/sql-lab/route.ts', modules)
  function send({ POST }, body) {
    return POST(new Request('https://local.test/assistant', { method: 'POST', body: JSON.stringify({
      accountId: userA, provider: 'groq', consent: 'groq', ...body,
    }) }))
  }
  return {
    train: (body) => send(trainer, body), lab: (body) => send(lab, body), calls,
    setUser: (id) => { user = id }, lock: () => { locked = true }, respond: (value) => { outcome = value },
  }
}

const empty = { mode: 'interview', topic: 'backend', level: 1, turns: [] }
const first = training.nextTrainingQuestion(empty).question
const waiting = { ...empty, pendingId: first.id }
const answer = 'Filtraria pedidos com um predicado em WHERE.'

test('teste de conhecimento e entrevista começam com uma pergunta e retomam estado válido', () => {
  assert.match(first.text, /SQL/)
  assert.ok(training.nextTrainingQuestion({ ...empty, mode: 'quiz', topic: 'redes' }).question.text.includes('DNS'))
  assert.deepEqual(training.parseTrainingSession(JSON.parse(JSON.stringify(waiting))), { ...waiting, report: undefined })
  assert.equal(training.parseTrainingCommand({ intent: 'finish', session: waiting }), null)
  assert.equal(training.parseTrainingCommand({ intent: 'answer', session: empty, answer }), null)
})

test('dificuldade se adapta, prioriza a lacuna observada e não repete perguntas', () => {
  const turn = { questionId: first.id, answer, ...feedback }
  const repeatTopic = training.nextTrainingQuestion({ ...empty, level: 2, turns: [turn] })
  assert.equal(repeatTopic.level, 1)
  assert.equal(repeatTopic.question.topic, first.topic)
  assert.notEqual(repeatTopic.question.id, first.id)
  const progress = training.nextTrainingQuestion({ ...empty, turns: [{ ...turn, adaptation: 'avançar' }] })
  assert.equal(progress.level, 2)
  assert.equal(progress.question.level, 2)
})

test('entrevista avalia uma resposta por vez e encerra com relatório baseado na sessão', async () => {
  const { train, calls, respond } = fixture()
  const result = await train({ intent: 'answer', session: waiting, answer })
  assert.equal(result.status, 200)
  assert.match(result.headers.get('cache-control'), /private, no-store/)
  assert.deepEqual((await result.json()).result, feedback)
  assert.equal(calls[0].provider, 'groq')
  assert.match(calls[0].system, /clareza para estágio/)
  assert.match(calls[0].messages[0].content, /predicado/)
  const turn = { questionId: first.id, answer, ...feedback }
  const next = training.nextTrainingQuestion({ ...empty, turns: [turn] }).question
  await train({ intent: 'answer', session: { ...empty, turns: [turn], pendingId: next.id }, answer: 'Considerei as linhas ativas.' })
  respond(report)
  const finish = await train({ intent: 'finish', provider: 'gemini', consent: 'gemini', session: {
    ...empty, turns: [turn, { ...turn, questionId: next.id, answer: 'Considerei as linhas ativas.' }],
  } })
  assert.deepEqual((await finish.json()).result, report)
  assert.equal(calls[2].provider, 'gemini')
  assert.equal(JSON.parse(calls[2].messages[0].content).turns.length, 2)
})

test('treino exige sessão, consentimento do provedor e respeita avaliação aberta', async () => {
  const { train, calls, setUser, lock, respond } = fixture()
  const body = { intent: 'answer', session: waiting, answer }
  setUser(null)
  assert.equal((await train(body)).status, 401)
  setUser(userB)
  assert.equal((await train(body)).status, 409)
  setUser(userA)
  assert.equal((await train({ ...body, provider: 'openrouter' })).status, 400)
  assert.equal(calls.length, 0)
  respond({ feedback: 'faltou adaptação' })
  assert.equal((await train(body)).status, 502)
  lock()
  assert.equal((await train(body)).status, 423)
  assert.equal(calls.length, 1)
})

test('laboratório tem cinco desafios com esquema, rubrica e três pistas autorais', () => {
  assert.equal(catalog.sqlLabChallenges.length, 5)
  assert.equal(new Set(catalog.sqlLabChallenges.map(({ slug }) => slug)).size, 5)
  assert.ok(catalog.sqlLabChallenges.every(({ schema, rubric, hints }) => schema.length && rubric.length >= 3 && hints.length === 3))
  assert.equal(catalog.parseSqlLabSubmission(' '.repeat(20)), null)
  assert.equal(catalog.parseSqlLabSubmission('a'.repeat(4001)), null)
})

test('laboratório persiste texto antes do feedback, isola titular e reutiliza retorno salvo', async () => {
  const { lab, calls, setUser, respond } = fixture()
  const base = { slug: 'join', attemptId }
  const submission = 'SELECT nome FROM clientes;'
  assert.equal((await lab({ ...base, intent: 'submit', submission })).status, 200)
  assert.equal((await lab({ ...base, intent: 'submit', submission })).status, 200)
  assert.equal((await lab({ ...base, intent: 'submit', submission: 'SELECT 2' })).status, 422)
  assert.equal(calls.length, 0)
  setUser(userB)
  assert.equal((await lab({ ...base, intent: 'feedback', accountId: userB })).status, 404)
  assert.equal(calls.length, 0)
  setUser(userA)
  respond('Revise a junção para preservar todos os clientes.')
  const corrected = await lab({ ...base, intent: 'feedback' })
  const { attempt } = await corrected.json()
  assert.equal(attempt.submission, submission)
  assert.match(attempt.formative_feedback, /Revise a junção/)
  assert.match(calls[0].system, /Revise a consulta SQL como texto/)
  assert.equal(JSON.parse(calls[0].messages[0].content).submission, submission)
  assert.equal((await lab({ ...base, intent: 'feedback' })).status, 200)
  assert.equal(calls.length, 1)
})

test('pista não transmite código do navegador e é bloqueada durante avaliação', async () => {
  const { lab, calls, lock, respond } = fixture()
  respond('Concentre-se na relação entre as tabelas.')
  const body = { slug: 'join', intent: 'hint', level: 2, submission: 'texto pessoal do aluno' }
  assert.equal((await lab({ ...body, level: 4 })).status, 400)
  assert.equal((await lab(body)).status, 200)
  assert.doesNotMatch(calls[0].messages[0].content, /texto pessoal/)
  lock()
  assert.equal((await lab(body)).status, 423)
  assert.equal(calls.length, 1)
})

test('treino e laboratório mostram controles e estados iniciais com rótulos acessíveis', () => {
  const modules = {
    react, 'react/jsx-runtime': jsx, 'lucide-react': { Blocks, MessagesSquare },
    '@/lib/assistant/study-client': {}, '@/lib/assistant/providers': providers, '@/lib/assistant/training': training,
    '@/lib/sql-lab/catalog': catalog, '@/contexts/SettingsContext': { useSettings: () => ({ settings: { ai_default_model: 'groq' } }) },
  }
  const { default: Training } = load('src/components/assistant/AssistantTraining.tsx', modules)
  const html = renderToStaticMarkup(react.createElement(Training, { accountId: userA, defaultProvider: 'groq' }))
  assert.match(html, /Testar conhecimento/)
  assert.match(html, /Simular entrevista/)
  assert.match(html, /Backend · trilha mista/)
  const { default: Editor } = load('src/components/sql-lab/SqlLabEditor.tsx', modules)
  const markup = renderToStaticMarkup(react.createElement(Editor, {
    accountId: userA, challenge: catalog.sqlLabChallenges[0], initialAttempts: [], savingAvailable: false,
  }))
  assert.match(markup, /for="sl-code"/)
  assert.match(markup, /disabled="">Salvar tentativa/)
  assert.match(markup, /As consultas salvas aparecerão aqui/)
  assert.match(markup, /Ver pista do material/)
})

test('laboratório apresenta feedback editável como comentário de estudo', () => {
  const { default: Editor } = load('src/components/sql-lab/SqlLabEditor.tsx', {
    react, 'react/jsx-runtime': jsx, '@/lib/assistant/study-client': {},
    '@/lib/assistant/providers': providers, '@/lib/sql-lab/catalog': catalog,
    '@/contexts/SettingsContext': { useSettings: () => ({ settings: { ai_default_model: 'groq' } }) },
  })
  const markup = renderToStaticMarkup(react.createElement(Editor, {
    accountId: userA, challenge: catalog.sqlLabChallenges[0], savingAvailable: true,
    initialAttempts: [{
      id: attemptId, submission: 'SELECT 1;', submitted_at: '2026-11-24T12:00:00Z',
      formative_feedback: 'Aprovado',
    }],
  }))
  assert.match(markup, /Feedback formativo registrado/)
  assert.match(markup, /A tentativa registra apenas o envio/)
  assert.match(markup, /<p class="sl-feedback">Aprovado<\/p>/)
  assert.doesNotMatch(markup, /Feedback formativo da IA/)
})
