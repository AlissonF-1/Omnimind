import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isLearningSlug, learningHref, learningQuestionHref, learningStepStatus, nextLearningStep,
  parseChallengeDelivery, remainingQuestions,
} from '../../src/lib/learning/progress.ts'

const at = '2026-11-24T13:00:00Z'
const viewed = { step_id: 'reading', viewed_at: at, completed_at: null }

test('retoma a primeira etapa sem conclusão persistida depois de recarregar', () => {
  const steps = [{ id: 'reading' }, { id: 'practice' }, { id: 'challenge' }]
  const reload = (rows) => JSON.parse(JSON.stringify(rows))
  assert.equal(nextLearningStep(steps, reload([viewed])).id, 'reading')
  assert.equal(nextLearningStep(steps, reload([{ ...viewed, completed_at: at }])).id, 'practice')
  assert.equal(nextLearningStep(steps, steps.map((step) => ({ step_id: step.id, completed_at: at }))), null)
})

test('preserva ordem e só retoma questões pendentes da rodada carregada', () => {
  const questions = ['version-1', 'version-2', 'version-3'].map((version_id) => ({ version_id }))
  const attempts = [{ version_id: 'version-1' }, { version_id: 'outra-versao' }]
  assert.deepEqual(remainingQuestions(questions, attempts), questions.slice(1))
  assert.deepEqual(remainingQuestions(questions, []), questions)
})

test('estados individuais não confundem leitura, prática, avaliação ou rubrica', () => {
  assert.equal(learningStepStatus('reading', viewed), 'Visualizada')
  assert.equal(learningStepStatus('reading', { ...viewed, completed_at: at }), 'Leitura confirmada')
  assert.equal(learningStepStatus('practice', viewed), 'Em andamento')
  assert.equal(learningStepStatus('practice', { ...viewed, completed_at: at }), 'Prática realizada')
  assert.equal(learningStepStatus('assessment', viewed), 'Em andamento')
  assert.equal(learningStepStatus('assessment', { ...viewed, completed_at: at }), 'Avaliação aprovada')
  assert.equal(learningStepStatus('challenge', viewed), 'Não enviado')
  const delivered = { ...viewed, completed_at: at, submitted_at: at }
  assert.equal(learningStepStatus('challenge', delivered), 'Enviado')
  assert.equal(learningStepStatus('challenge', { ...delivered, reviewed_at: at, challenge_approved: false }), 'Avaliado')
  assert.equal(learningStepStatus('challenge', { ...delivered, reviewed_at: at, challenge_approved: true }), 'Aprovado')
})

test('normaliza a entrega e aceita links HTTPS sem credenciais nem esquemas ativos', () => {
  assert.deepEqual(parseChallengeDelivery('text', '  SELECT 1;  ', 'ignored'), { text: 'SELECT 1;', url: null })
  assert.deepEqual(parseChallengeDelivery('url', '', 'HTTPS://GITHUB.COM/a/b'), { text: null, url: 'https://github.com/a/b' })
  for (const url of ['javascript:alert(1)', '//github.com/a/b', 'https://user@github.com/a/b',
    'https://github.com', 'https://github.com/a/ b', 'https://github.com/a\\b', 'https://github.com/a/\u0000b']) {
    assert.equal(parseChallengeDelivery('url', null, url), null, url)
  }
  assert.equal(parseChallengeDelivery('text', '\n\t', null), null)
  assert.equal(parseChallengeDelivery('text', 'a'.repeat(12001), null), null)
})

test('rotas internas de trilhas usam parâmetros codificados', () => {
  assert.equal(isLearningSlug('sql-concursos-e-mercado'), true)
  assert.equal(isLearningSlug('../login'), false)
  assert.equal(learningHref('sql', 'step&x', true), '/dashboard/trilhas/sql?etapa=step%26x&revisao=1')
  assert.equal(learningQuestionHref('sql', 'step'), '/dashboard/trilhas/sql?etapa=step&resultado=1')
})
