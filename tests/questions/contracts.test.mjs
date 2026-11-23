import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isQuestionAnswerInput,
  parseQuestionFeedback,
  questionErrorFromSqlState,
} from '../../src/lib/questions/contracts.ts'

const uuid = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`

const validInput = { versionId: uuid(1), optionId: uuid(2), requestId: uuid(3) }
const feedback = {
  attemptId: uuid(4),
  versionId: validInput.versionId,
  selectedOptionId: uuid(11),
  correctOptionId: uuid(12),
  isCorrect: false,
  answeredAt: '2026-11-20T12:00:00+00:00',
  options: Array.from({ length: 5 }, (_, index) => ({
    optionId: uuid(index + 11),
    position: index + 1,
    explanation: `Explicação ${index + 1}`,
  })),
}

test('valida os três identificadores da resposta em tempo de execução', () => {
  assert.equal(isQuestionAnswerInput(validInput), true)
  assert.equal(isQuestionAnswerInput({ ...validInput, optionId: `${uuid(2)}\n` }), false)
  assert.equal(isQuestionAnswerInput({ ...validInput, requestId: undefined }), false)
  assert.equal(isQuestionAnswerInput(null), false)
})

test('serializa somente campos de feedback previstos no contrato', () => {
  const rpcResult = {
    ...feedback,
    userId: uuid(99),
    options: feedback.options.map((option) => ({ ...option, internal: 'campo extra' })),
  }
  assert.deepEqual(parseQuestionFeedback(rpcResult), feedback)
})

test('recusa feedback sem cinco explicações coerentes com a correção', () => {
  assert.equal(parseQuestionFeedback({ ...feedback, options: feedback.options.slice(1) }), null)
  assert.equal(parseQuestionFeedback({ ...feedback, correctOptionId: uuid(99) }), null)
  assert.equal(parseQuestionFeedback({ ...feedback, isCorrect: true }), null)
})

test('mapeia falhas de banco para erros estáveis da aplicação', () => {
  assert.equal(questionErrorFromSqlState('28000'), 'UNAUTHENTICATED')
  assert.equal(questionErrorFromSqlState('22023'), 'INVALID_INPUT')
  assert.equal(questionErrorFromSqlState('23505'), 'REQUEST_CONFLICT')
  assert.equal(questionErrorFromSqlState('P0002'), 'ATTEMPT_NOT_FOUND')
  assert.equal(questionErrorFromSqlState('unexpected'), 'UNAVAILABLE')
})
