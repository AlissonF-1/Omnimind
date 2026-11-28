import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { prepareContent, toImportSql } from '../../scripts/academy-content.mjs'

const original = JSON.parse(await readFile(new URL('../../content/academy/v2.example.json', import.meta.url), 'utf8'))
const activities = (pkg) => pkg.formations[0].chapters[0].lessons[0].exercises
const get = (pkg, kind) => activities(pkg).find((exercise) => exercise.kind === kind)
const privateFields = ['accepted', 'acceptedByField', 'correctOptionId', 'correctOrder', 'correctLines', 'pairs',
  'explanation', 'solution', 'hiddenCases']

test('v2 valida todos os formatos e publica somente os campos dos alunos', async () => {
  const result = await prepareContent(original)
  assert.equal(result.schemaVersion, 2)
  const shown = result.lessons[0].exercises
  assert.equal(shown.filter(({ kind }) => kind === 'python').length, 2)
  assert.deepEqual(new Set(shown.map(({ kind }) => kind)), new Set(['text', 'python', 'multiple-choice',
    'ordering', 'parsons', 'matching', 'output', 'trace', 'fill-in', 'question-set']))
  for (const exercise of result.lessons.flatMap(({ exercises }) => exercises)) {
    for (const key of privateFields) assert.ok(!(key in exercise), `${key} vazou em ${exercise.id}`)
  }
  assert.equal(shown.find(({ kind }) => kind === 'multiple-choice').resource, 'coding')
  assert.equal(result.keys['variaveis-e-saida/escolher-funcao'].correctOptionId, 'escrever')
  assert.match(toImportSql(result), /SELECT public\.academy_import_release_v2\(/)
})

test('schema v1 rejeita recursos novos e mantém contrato para o piloto', async () => {
  const incompatible = { ...original, schemaVersion: 1 }
  await assert.rejects(prepareContent(incompatible, { checkFiles: false }))
  const pilot = JSON.parse(await readFile(new URL('../../content/academy/pilot.example.json', import.meta.url), 'utf8'))
  const sql = toImportSql(await prepareContent(pilot))
  assert.match(sql, /SELECT public\.academy_import_release\(/)
})

test('validador rejeita respostas inconsistentes nas atividades estruturadas', async () => {
  const failures = [
    ['multiple-choice', (x) => { x.correctOptionId = 'ausente' }, /Alternativa correta/],
    ['ordering', (x) => { x.correctOrder = ['ler', 'calcular', 'inexistente'] }, /corresponder aos itens/],
    ['parsons', (x) => { x.correctLines[1].indent = 6 }, /maxIndent/],
    ['matching', (x) => { x.pairs.mostrar = x.pairs.capturar }, /corresponder aos itens/],
    ['trace', (x) => { delete x.acceptedByField.final }, /corresponder aos itens/],
    ['fill-in', (x) => { x.acceptedByField.funcao = ['   '] }, /Resposta vazia/],
  ]
  for (const [kind, edit, expected] of failures) {
    const invalid = structuredClone(original)
    edit(get(invalid, kind))
    await assert.rejects(prepareContent(invalid, { checkFiles: false }), expected)
  }
})

test('pedido de equivalência exige uma origem anterior e preserva o pedido na projeção', async () => {
  const pkg = structuredClone(original)
  const lesson = pkg.formations[0].chapters[0].lessons[0]
  lesson.progressFromVersion = 1
  await assert.rejects(prepareContent(pkg, { checkFiles: false }), /precisa ser anterior/)
  pkg.version = 2
  const output = await prepareContent(pkg, { checkFiles: false })
  assert.equal(output.lessons[0].progressFromVersion, 1)
})
