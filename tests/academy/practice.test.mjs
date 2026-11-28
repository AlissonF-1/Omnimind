import assert from 'node:assert/strict'
import test from 'node:test'
import { preparePractice, toPracticeSql } from '../../scripts/academy-practice.mjs'
import { getPracticeFilters, normalizePracticeOutput, practiceHref, practicePosition } from '../../src/lib/academy/practice.ts'

const question = { id:'TECH-TEST-0001', title:'Atividade sintética', topic:'Fixture', difficulty:'basic', kind:'fill-in',
  competencies:['TEST-C01'], misconceptions:[], prerequisites:[], hints:['Veja o nome já declarado.'],
  prompt:'Preencha o nome usado na saída.', explanation:'A grafia do nome precisa coincidir.',
  code:'Nome = 0\nprint({{campo}})', fields:[{id:'campo',label:'Nome na chamada',accepted:['Nome']}], solution:'Nome = 0\nprint(Nome)' }
const batch = { firstId:question.id, lastId:question.id, questions:[question], expectedCount:1,
  revision:1, status:'draft', batchId:'test', moduleId:'TEST', competencies:[{id:'TEST-C01',description:'Competência fictícia'}], misconceptions:[] }
const minimallyValid = () => true

test('projeção conserva IDs e esconde gabarito e solução', () => {
  const result = preparePractice([batch],minimallyValid,[{editorialId:question.id,lessons:['curso/aula-a','curso/aula-b','curso/aula-b']}])
  const [item] = result.items
  assert.equal(item.id,'TECH-TEST-0001')
  assert.equal(item.activity.id,'tech-test-0001')
  assert.deepEqual(item.lessons,['curso/aula-a','curso/aula-b'])
  assert.deepEqual(item.grading.acceptedByField,{campo:['Nome']})
  assert.ok(item.grading.solution)
  assert.doesNotMatch(JSON.stringify(item.activity),/"(?:accepted|acceptedByField|solution|explanation)"\s*:/)
  assert.match(toPracticeSql(result),/academy_practice_\[a-z0-9_\]\+_synthetic/)
})

test('retém atividades abertas e falha para duas definições do mesmo ID', () => {
  const open = { ...question,kind:'open',reference:'Resposta privada',criteria:['Analisar o raciocínio.'] }
  const result = preparePractice([{...batch,questions:[open]}],minimallyValid)
  assert.equal(result.items.length,0)
  assert.equal(result.report[0].status,'editorial-only')
  assert.throws(() => preparePractice([batch,{...batch,batchId:'other'}],minimallyValid),/duplicado/)
})

test('ordenações alternativas exigem uma permutação completa', () => {
  const ordering = { ...question,kind:'ordering',code:undefined,
    items:[{id:'a',text:'Primeiro'},{id:'b',text:'Segundo'}],correctOrder:['a','b'] }
  const add = (equivalentOrders) => preparePractice([{...batch,questions:[ordering]}],minimallyValid,[{editorialId:question.id,equivalentOrders}])
  assert.deepEqual(add([['b','a']]).items[0].grading.acceptedOrders,[['b','a']])
  assert.throws(() => add([['a','a']]),/IDs da resposta/)
})

test('links aceitam somente filtros conhecidos e codificam contexto da aula', () => {
  const filters = getPracticeFilters({ topic:' Entrada e saída ',lesson:'omni-content-001/tech-02',mode:'mistakes',
    skill:'PY-C01',kind:'constructor',difficulty:['basic'],user:'outra conta' })
  assert.deepEqual(filters,{ topic:'Entrada e saída', lesson:'omni-content-001/tech-02',mode:'mistakes',skill:'PY-C01' })
  const href = new URL(practiceHref(filters,{after:'TECH-TEST-0001'}),'http://127.0.0.1')
  assert.equal(href.searchParams.get('lesson'),'omni-content-001/tech-02')
  assert.equal(href.searchParams.get('after'),'TECH-TEST-0001')
})

test('retomada retorna a primeira pendente e bloqueia salto à seguinte', () => {
  const slots = [{position:1,answered_at:'2026-11-27'}, {position:2,answered_at:null}, {position:3,answered_at:null}]
  assert.equal(practicePosition(slots,undefined).selected.position,2)
  assert.equal(practicePosition(slots,'3').selected.position,2)
  assert.equal(practicePosition(slots,'1').selected.position,1)
  assert.equal(practicePosition(slots.slice(0,1),undefined).selected,undefined)
})

test('saída separa opcionalidade da última quebra de espaços e quebras internas', () => {
  assert.equal(normalizePracticeOutput('a \r\nb\r\n'),'a \nb')
  assert.notEqual(normalizePracticeOutput('a\nb'),'a \nb')
  assert.notEqual(normalizePracticeOutput('a \nb\n\n'),'a \nb')
})
