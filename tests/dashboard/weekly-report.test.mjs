import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import * as contracts from '../../src/lib/assistant/providers.ts'

const account = '00000000-0000-4000-8000-000000000001'
const generatedReport = 'Você consolidou um dos seus cartões.\n\nRevise os conceitos em que teve lapsos.'

function load(path, modules = {}, globals = {}) {
  const source = readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
  const result = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  })
  const exports = {}
  const require = (name) => {
    assert.ok(name in modules, 'Dependência não simulada: ' + name)
    return modules[name]
  }
  new Function('exports', 'require', ...Object.keys(globals), result.outputText)(exports, require, ...Object.values(globals))
  return exports
}

function fixture(savedReport = null) {
  const calls = []
  const writes = []
  const generation = load('src/lib/assistant/generation.ts', {
    'server-only': {}, '@google/genai': {}, './providers': contracts,
  }, {
    process: { env: { GROQ_API_KEY: 'fixture' } },
    fetch: async (url, request) => {
      calls.push({ url, body: JSON.parse(request.body) })
      return Response.json({ choices: [{ message: { content: generatedReport } }] })
    },
  })
  const providers = load('src/lib/ai-fallback.ts', { 'server-only': {}, './assistant/generation': generation })
  const query = {
    select() { return this },
    eq() { return this },
    maybeSingle: async () => ({ data: savedReport ? { ai_report: savedReport } : null }),
    upsert: async (data) => { writes.push(data); return { error: null } },
  }
  const actions = load('src/actions/stats.ts', {
    '@/actions/achievements': {},
    '@/lib/ai-fallback': providers,
    '@/lib/profile': {},
    '@/utils/supabase/server': {
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: account } }, error: null }) },
        from(table) {
          if (table === 'daily_study_logs') return query
          assert.equal(table, 'flashcards')
          return { select: () => ({
            eq: async () => ({ data: [{ stability: 20, lapses: 2, notes: { title: 'SQL' } }] }),
          }) }
        },
      }),
    },
  })
  return { ...providers, ...actions, calls, writes }
}

test('relatório semanal usa GPT-OSS 20B na Groq e guarda a resposta do provedor', async () => {
  const { getWeeklyLearningCycleReport, calls, writes } = fixture()
  assert.deepEqual(await getWeeklyLearningCycleReport(), { report: generatedReport })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/chat/completions')
  assert.equal(calls[0].body.model, 'openai/gpt-oss-20b')
  assert.equal(writes.length, 1)
  assert.equal(writes[0].user_id, account)
  assert.equal(writes[0].ai_report, generatedReport)
})

test('relatório salvo é reutilizado antes de chamar a Groq', async () => {
  const { getWeeklyLearningCycleReport, calls, writes } = fixture('Relatório salvo')
  assert.deepEqual(await getWeeklyLearningCycleReport(), { report: 'Relatório salvo' })
  assert.equal(calls.length, 0)
  assert.equal(writes.length, 0)
})

test('tarefas do serviço compartilhado usam modelos Groq compatíveis com cada perfil', async () => {
  const { callAIWithFallback, calls } = fixture()
  await callAIWithFallback('Sistema', 'Mensagem')
  await callAIWithFallback('Sistema', 'Mensagem', 'critical')
  assert.deepEqual(calls.map(({ body }) => body.model), ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'])
})
