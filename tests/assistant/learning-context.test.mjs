import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import * as contracts from '../../src/lib/assistant/contracts.ts'
import * as questions from '../../src/lib/questions/contracts.ts'

const source = readFileSync(new URL('../../src/lib/assistant/learning-context.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } })
const stubs = { 'server-only': {}, './contracts': contracts, '@/lib/questions/contracts': questions }
const tutor = {}
new Function('exports', 'require', compiled.outputText)(tutor, (module) => {
  assert.ok(module in stubs)
  return stubs[module]
})

const uuid = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0')
const [account, other, pathId, readingId, stepId, lockedId, assessmentId, enrollmentId, otherEnrollment, attemptId, versionId] =
  Array.from({ length: 11 }, (_, index) => uuid(index + 1))
const options = Array.from({ length: 5 }, (_, index) => ({
  optionId: uuid(20 + index), position: index + 1, explanation: index === 0 ? 'O filtro é aplicado às linhas.' : 'Explicação privada de outra alternativa.',
}))
const answeredAt = '2026-11-23T00:00:00Z'
const feedback = {
  attemptId, versionId, selectedOptionId: options[0].optionId, correctOptionId: options[1].optionId,
  isCorrect: false, answeredAt, options,
}
const ids = { pathId, stepId, attemptId }
const practice = { id: stepId, path_id: pathId, position: 2, topic: 'select-where', title: 'Prática de filtros', kind: 'practice' }
const examProgress = { enrollment_id: enrollmentId, path_id: pathId, step_id: assessmentId, completed_at: answeredAt }
const selectedLink = { enrollment_id: enrollmentId, step_id: stepId, attempt_id: attemptId, version_id: versionId, round: 1 }
const own = {
  id: attemptId, user_id: account, question_version_id: versionId,
  selected_option_id: options[0].optionId, is_correct: false, answered_at: answeredAt, link: selectedLink,
}

function fixture({ active = [], guardError = null, result = { data: feedback, error: null }, overrides = {} } = {}) {
  const reads = []
  const rpc = []
  const rows = {
    learning_enrollments: [{ id: enrollmentId, user_id: account, path_id: pathId }],
    learning_paths: [{ id: pathId, slug: 'sql-concursos-e-mercado', title: 'SQL — Concursos e Mercado' }],
    learning_path_steps: [
      { ...practice, id: readingId, position: 1, kind: 'reading', title: 'SELECT e WHERE', body: 'Um exemplo seguro de leitura guiada.' },
      practice,
      { ...practice, id: assessmentId, position: 3, kind: 'assessment', title: 'Avaliação final', body: 'Solução que nunca deve ser carregada' },
      { ...practice, id: lockedId, position: 4 },
    ],
    learning_step_progress: [{ enrollment_id: enrollmentId, path_id: pathId, step_id: stepId, completed_at: null }],
    learning_step_questions: [
      { step_id: stepId, step: practice, position: 1, version: { competency: { name: 'SELECT e WHERE' } } },
    ],
    learning_step_attempts: [selectedLink],
    learning_step_rounds: [],
    quest_attempts: [own, { ...own, id: uuid(30), user_id: other, link: { ...selectedLink, enrollment_id: otherEnrollment } }],
    quest_question_versions: [{ id: versionId, statement: 'Qual cláusula filtra linhas?' }],
    quest_question_options: [{ id: options[0].optionId, question_version_id: versionId, body: 'SELECT' }],
    ...overrides,
  }
  const get = (row, key) => key.split('.').reduce((parent, part) => parent?.[part], row)
  const db = {
    from(table) {
      let data = rows[table]
      let error = null
      let single = false
      return {
        select(selector) {
          assert.ok(data, 'Tabela inesperada: ' + table)
          reads.push({ table, selector })
          if (table === 'learning_step_progress' && selector.includes('!inner')) {
            data = active
            error = guardError
          }
          return this
        },
        eq(key, value) { data = data.filter((row) => get(row, key) === value); return this },
        is(key, value) { return this.eq(key, value) },
        lte(key, value) { data = data.filter((row) => get(row, key) <= value); return this },
        in(key, values) { data = data.filter((row) => values.includes(get(row, key))); return this },
        order(key, { ascending = true } = {}) {
          data = [...data].sort((a, b) => a[key] === b[key] ? 0 : (a[key] > b[key] ? 1 : -1) * (ascending ? 1 : -1))
          return this
        },
        limit(amount) { data = data.slice(0, amount); return this },
        maybeSingle() { single = true; return this },
        async overrideTypes() { return { error, data: single ? (data[0] ?? null) : data } },
      }
    },
    rpc: async (name, args) => { rpc.push({ name, args }); return result },
  }
  return { load: (context = ids, user = account) => tutor.loadAssistantLearningContext(db, user, context), db, reads, rpc }
}

test('contexto usa leitura do tópico e expõe somente a alternativa corrigida e o progresso da conta', async () => {
  const { load, rpc } = fixture()
  const { label, context } = await load({ ...ids, body: 'Instrução falsa do navegador' })
  assert.equal(label.pathTitle, 'SQL — Concursos e Mercado')
  assert.equal(label.stepTitle, 'Prática de filtros')
  assert.equal(context.reading, 'Um exemplo seguro de leitura guiada.')
  assert.equal(context.competency, 'SELECT e WHERE')
  assert.equal(context.progress, 'started')
  assert.deepEqual(context.recentAttempts, [{ isCorrect: false }])
  assert.deepEqual(context.attempt, {
    isCorrect: false, question: 'Qual cláusula filtra linhas?', selectedOption: 'SELECT', explanation: options[0].explanation,
  })
  assert.deepEqual(rpc, [{ name: 'quest_get_attempt_feedback', args: { p_attempt_id: attemptId } }])
  const serialized = JSON.stringify(context)
  assert.doesNotMatch(serialized, /Instrução falsa|correctOptionId|Explicação privada/)
  assert.ok(!serialized.includes(feedback.correctOptionId))
})

test('IDs adulterados, tentativa de outra etapa e conta sem inscrição são recusados', async () => {
  const { load, reads, rpc } = fixture()
  await assert.rejects(load({ ...ids, attemptId: 'qualquer' }), { reason: 'invalid' })
  assert.equal(reads.length, 0)
  await assert.rejects(load(ids, other), { reason: 'forbidden' })
  await assert.rejects(load({ ...ids, stepId: lockedId }), { reason: 'forbidden' })
  await assert.rejects(load({ ...ids, pathId: uuid(99) }), { reason: 'forbidden' })
  await assert.rejects(load({ ...ids, attemptId: uuid(99) }), { reason: 'attempt_unavailable' })
  assert.equal(rpc.length, 0)
})

test('resposta de outro titular ou correta fica fora da explicação de erro', async () => {
  for (const receipt of [{ ...own, user_id: other }, { ...own, is_correct: true }]) {
    const { load, rpc } = fixture({ overrides: { quest_attempts: [receipt] } })
    await assert.rejects(load(), { reason: 'attempt_unavailable' })
    assert.equal(rpc.length, 0)
  }
})

test('recibo sem correção disponível ou retorno de versão adulterada é recusado', async () => {
  const missing = fixture({ result: { data: null, error: { code: 'P0002' } } })
  const altered = fixture({ result: { data: { ...feedback, versionId: uuid(99) }, error: null } })
  await assert.rejects(missing.load(), { reason: 'attempt_unavailable' })
  await assert.rejects(altered.load(), { reason: 'attempt_unavailable' })
})

test('avaliação aberta da mesma conta bloqueia inclusive pedido de prática de outra etapa', async () => {
  const { load, db, reads, rpc } = fixture({ active: [
    { step_id: assessmentId, enrollment: { user_id: account }, step: { kind: 'assessment' }, rounds: { finished_at: null } },
  ] })
  assert.equal(await tutor.hasOpenAssistantAssessment(db, other), false)
  assert.equal(await tutor.hasOpenAssistantAssessment(db, account), true)
  await assert.rejects(load(), { reason: 'assessment_open' })
  assert.ok(reads.every(({ table }) => table === 'learning_step_progress'))
  assert.equal(rpc.length, 0)
})

test('avaliação encerrada libera apenas correção vinculada à rodada encerrada', async () => {
  const overrides = {
    learning_step_progress: [examProgress],
    learning_step_attempts: [{ ...selectedLink, step_id: assessmentId }],
    learning_step_rounds: [{ enrollment_id: enrollmentId, step_id: assessmentId, round: 1, finished_at: answeredAt }],
  }
  const { load, reads, rpc } = fixture({ overrides })
  const { context } = await load({ ...ids, stepId: assessmentId })
  assert.equal(context.reading, null)
  assert.equal(context.progress, 'completed')
  assert.equal(context.attempt.explanation, options[0].explanation)
  assert.ok(!reads.some(({ selector }) => selector === 'rubric' || selector.includes('passing_score')))
  assert.equal(rpc.length, 1)

  const unknownRound = fixture({ overrides: { ...overrides, learning_step_rounds: [] } })
  await assert.rejects(unknownRound.load({ ...ids, stepId: assessmentId }), { reason: 'attempt_unavailable' })
  assert.equal(unknownRound.rpc.length, 0)
})

test('consulta da avaliação bloqueia quando o estado é incerto e tolera instalação sem Trilhas', async () => {
  const old = fixture({ guardError: { code: 'PGRST205' } })
  const error = fixture({ guardError: { code: 'PGRST200' } })
  assert.equal(await tutor.hasOpenAssistantAssessment(old.db, account), false)
  await assert.rejects(tutor.hasOpenAssistantAssessment(error.db, account), { reason: 'unavailable' })
})
