import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import * as contracts from '../../src/lib/questions/contracts.ts'
import * as progress from '../../src/lib/learning/progress.ts'

const source = readFileSync(new URL('../../src/actions/learning.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
})
const uuid = (value) => '00000000-0000-4000-8000-' + String(value).padStart(12, '0')
const step = uuid(4)
const input = { versionId: uuid(5), optionId: uuid(10), requestId: uuid(6) }

function fixture({ user = { id: uuid(1) }, data = null, error = null } = {}) {
  const calls = []
  const mod = { exports: {} }
  const imports = {
    'next/cache': { revalidatePath: (path) => calls.push(['revalidate', path]) },
    'next/navigation': { redirect: (path) => { throw new Error('redirect ' + path) } },
    '@/lib/questions/contracts': contracts,
    '@/lib/learning/progress': progress,
    '@/utils/supabase/server': {
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user }, error: null }) },
        rpc: async (name, args) => { calls.push([name, args]); return { data, error } },
      }),
    },
  }
  new Function('exports', 'require', outputText)(mod.exports, (name) => imports[name])
  return { actions: mod.exports, calls }
}

test('ações de inscrição e correção recusam sessão anônima antes de chamar o banco', async () => {
  const { actions, calls } = fixture({ user: null })
  assert.match((await actions.enrollLearningAction('sql', uuid(1))).error, /sessão expirou/)
  assert.deepEqual(await actions.submitLearningAnswerAction(step, 1, input), { ok: false, error: 'UNAUTHENTICATED' })
  assert.deepEqual(calls, [])
})

test('resposta usa o contexto da rodada e preserva a chave sem enviar nota ou titular ao banco', async () => {
  const data = {
    attemptId: uuid(9), versionId: input.versionId, selectedOptionId: input.optionId,
    correctOptionId: input.optionId, isCorrect: true, answeredAt: '2026-11-24T00:00:00Z',
    options: Array.from({ length: 5 }, (_, index) => ({
      optionId: uuid(10 + index), position: index + 1, explanation: 'Explicação do motor',
    })),
  }
  const { actions, calls } = fixture({ data })
  const first = await actions.submitLearningAnswerAction(step, 2, { ...input, isCorrect: false, userId: uuid(20) })
  const second = await actions.submitLearningAnswerAction(step, 2, input)
  assert.deepEqual(first, { ok: true, feedback: data })
  assert.deepEqual(second, first)
  assert.deepEqual(calls, Array(2).fill(['learn_answer_step', {
    p_step_id: step, p_round: 2, p_version_id: input.versionId, p_option_id: input.optionId, p_request_id: input.requestId,
  }]))
})

test('falha ao confirmar a leitura fica no formulário e sucesso redireciona para a etapa', async () => {
  const rejected = fixture({ error: { code: '42501' } })
  assert.match((await rejected.actions.confirmLearningReadingAction('sql', step)).error, /indisponível|disponível/)
  const accepted = fixture()
  await assert.rejects(accepted.actions.confirmLearningReadingAction('sql', step), {
    message: 'redirect /dashboard/trilhas/sql?etapa=' + step,
  })
  assert.deepEqual(accepted.calls, [
    ['learn_confirm_reading', { p_step_id: step }],
    ['revalidate', '/dashboard/trilhas'],
    ['revalidate', '/dashboard/trilhas/sql'],
  ])
})
