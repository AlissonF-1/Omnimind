import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import * as progress from '../../src/lib/learning/progress.ts'

function fixture({ finished = false, embedUnavailable = false, invisibleAttempt = false } = {}) {
  const source = readFileSync(new URL('../../src/lib/learning/server.ts', import.meta.url), 'utf8')
  const result = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  })
  const mocks = {
    'server-only': {},
    './progress': progress,
    '@/lib/questions/server': { getPracticeQuestion: async (_session, id) => ({ version: { id } }) },
  }
  const exports = {}
  new Function('exports', 'require', result.outputText)(exports, (name) => mocks[name])
  const reads = []
  const db = {
    from(table) {
      return {
        select(fields) {
          const record = { table, fields, filters: {} }
          reads.push(record)
          return {
            eq(key, value) { record.filters[key] = value; return this },
            order() { return this },
            async overrideTypes() {
              if (table === 'learning_step_rounds') return { data: [{ round: 1, finished_at: finished ? '2026-11-24' : null }] }
              if (table === 'learning_step_questions') {
                return { data: [{ version_id: 'version-1', position: 1 }, { version_id: 'version-2', position: 2 }] }
              }
              const versions = finished ? ['version-1', 'version-2'] : ['version-1']
              if (fields === 'version_id') return { data: versions.map((version_id) => ({ version_id })) }
              if (embedUnavailable) return { error: { code: 'PGRST200' } }
              return { data: versions.map((version_id, index) => ({
                version_id, attempt_id: 'attempt-' + (index + 1), attempt: invisibleAttempt ? null : { is_correct: index === 1 },
              })) }
            },
          }
        },
      }
    },
  }
  return { reads, load: (withMistakes) => exports.getLearningPractice({ db, userId: 'me' }, 'enrollment', 'step', withMistakes) }
}

test('reabrir a prática recupera o erro próprio corrigido e preserva a próxima questão', async () => {
  const { load, reads } = fixture()
  const practice = await load(true)
  assert.deepEqual(practice.mistakes, [{ attemptId: 'attempt-1', position: 1 }])
  assert.equal(practice.position, 2)
  assert.equal(practice.question.version.id, 'version-2')
  const attemptReads = reads.filter(({ table }) => table === 'learning_step_attempts')
  assert.deepEqual(attemptReads, [{
    table: 'learning_step_attempts', fields: 'version_id,attempt_id,attempt:quest_attempts(is_correct)',
    filters: { enrollment_id: 'enrollment', step_id: 'step', round: 1, 'attempt.user_id': 'me' },
  }])
})

test('o resultado da prática concluída reabre somente os erros e avaliação fechada omite a consulta', async () => {
  const completedPractice = fixture({ finished: true })
  assert.deepEqual((await completedPractice.load(true)).mistakes, [{ attemptId: 'attempt-1', position: 1 }])
  const assessment = fixture({ finished: true })
  assert.deepEqual((await assessment.load(false)).mistakes, [])
  assert.ok(assessment.reads.every(({ table }) => table !== 'learning_step_attempts'))
})

test('falha no carregamento adicional de erros preserva a questão pendente', async () => {
  const { load } = fixture({ embedUnavailable: true })
  const practice = await load(true)
  assert.deepEqual(practice.mistakes, [])
  assert.equal(practice.question.version.id, 'version-2')
})

test('vínculo com recibo indisponível mantém a ordem da prática sem oferecer explicação', async () => {
  const { load } = fixture({ invisibleAttempt: true })
  const practice = await load(true)
  assert.deepEqual(practice.mistakes, [])
  assert.equal(practice.question.version.id, 'version-2')
})
