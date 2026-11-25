import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import * as progress from '../../src/lib/learning/progress.ts'
import * as lab from '../../src/lib/sql-lab/catalog.ts'

const nodeRequire = createRequire(import.meta.url)
const link = ({ children, prefetch, ...props }) => {
  assert.equal(prefetch, false)
  return createElement('a', props, children)
}
const image = ({ src, alt }) => createElement('img', { src, alt })
const tutorEvents = new EventTarget()
let practice
const mocks = {
  'next/link': link,
  'next/image': image,
  '@/actions/learning': {
    beginLearningStepAction() {}, enrollLearningAction() {}, confirmLearningReadingAction() {}, submitLearningAnswerAction() {},
  },
  '@/lib/learning/progress': progress,
  '@/lib/sql-lab/catalog': lab,
  './LearningForms': { LearningActionForm: ({ label }) => createElement('button', { type: 'submit' }, label) },
  '@/lib/assistant/contracts': { assistantPath: '/dashboard/assistente' },
  '@/lib/questions/server': { getQuestionSession: async () => ({}) },
  '@/lib/learning/server': { getLearningCatalog: async () => [], getLearningPractice: async () => practice },
  '@/components/questions/QuestionPractice': () => createElement('section', null, 'Questão da rodada'),
  '@/components/questions/SqlCode': ({ children }) => children,
  'react-markdown': ({ children }) => createElement('p', null, children),
}

function load(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  })
  const exports = {}
  new Function('exports', 'require', 'window', outputText)(exports, (name) => mocks[name] ?? nodeRequire(name), tutorEvents)
  return exports
}

const { LearningHero, LearningMap, LearningPathCard } = load('../../src/components/learning/LearningPresentation.tsx')
const { LearningTutorActions, LearningTutorButton } = load('../../src/components/learning/LearningTutorActions.tsx')
mocks['./LearningPresentation'] = { learningKindLabel: { reading: 'Leitura guiada' } }
mocks['./LearningTutorActions'] = { LearningTutorActions, LearningTutorButton }
mocks['@/components/learning/LearningPresentation'] = { LearningPathCard }
const { LearningActivity } = load('../../src/components/learning/LearningActivity.tsx')
const { default: LearningCatalogPage } = load('../../src/app/dashboard/trilhas/page.tsx')
const render = (component, props) => renderToStaticMarkup(createElement(component, props))
const at = '2026-11-24T00:00:00Z'
const path = { id: 'p', slug: 'sql-concursos-e-mercado', title: 'SQL — Concursos e Mercado', description: 'Pratique SQL.', kind: 'concurso' }
const steps = [
  { id: 'l', topic: 'select-where', title: 'SELECT e WHERE', kind: 'reading' },
  { id: 'p', topic: 'select-where', title: 'Prática de filtros', kind: 'practice' },
  { id: 'd', topic: 'challenge', title: 'Desafio prático', kind: 'challenge' },
  { id: 'a', topic: 'assessment', title: 'Avaliação final', kind: 'assessment' },
]

test('catálogo e capa usam arte local e exibem progresso e retomada reais', () => {
  const html = render(LearningPathCard, { path: { ...path, enrolled: true, completed: 1, total: 4, next: steps[1] } })
  assert.match(html, /\/images\/trilhas\/sql\.webp/)
  assert.match(html, /25%/)
  assert.match(html, /Continuar aprendendo/)
  assert.match(html, /\/dashboard\/trilhas\/sql-concursos-e-mercado/)
  const preview = render(LearningHero, { path, enrolled: false, completed: 0, total: 4, next: steps[0] })
  assert.match(preview, /Começar trilha/)
  assert.match(preview, /<progress value="0" max="4"/)
})

test('mapa agrupa leitura e prática, preserva estados e bloqueia etapa não liberada', () => {
  const rows = [
    { step_id: 'l', completed_at: at, viewed_at: at },
    { step_id: 'p', completed_at: at, viewed_at: at },
    { step_id: 'd', completed_at: at, viewed_at: at, submitted_at: at },
  ]
  const html = render(LearningMap, { path, steps, progress: rows, next: steps[3], enrolled: true })
  assert.equal((html.match(/class="lp-mission"/g) ?? []).length, 3)
  assert.match(html, /Leitura confirmada/)
  assert.match(html, /Prática realizada/)
  assert.match(html, /Enviado/)
  assert.match(html, /data-topic="challenge" data-state="delivered"/)
  assert.doesNotMatch(html, /Aprovado|Avaliação aprovada/)
  assert.match(html, /Abrir avaliação final/)
  const initial = render(LearningMap, { path, steps, progress: [], next: steps[0], enrolled: true })
  assert.match(initial, /Bloqueada/)
  assert.doesNotMatch(initial, /Abrir avaliação final/)
})

test('leitura mostra ajuda contextual, preserva a confirmação e transmite ao launcher apenas o contexto da atividade', () => {
  const reading = { ...steps[0], body: 'Exemplo guiado de SQL.' }
  const html = render(LearningActivity, { session: {}, enrollment: 'e', path, step: reading, progress: {}, next: null })
  assert.match(html, /Pedir uma dica/)
  assert.match(html, /Explicar assunto/)
  assert.match(html, /Exemplo guiado de SQL\./)
  assert.match(html, /Confirmar leitura/)
  assert.match(html, /laboratorio-sql\/select-where\?etapa=l/)
  assert.doesNotMatch(html, /Explicar meu erro/)

  const scope = { pathId: path.id, stepId: reading.id, label: { pathTitle: path.title, stepTitle: reading.title, slug: path.slug } }
  let detail
  tutorEvents.addEventListener('open-chat', (event) => { detail = event.detail }, { once: true })
  LearningTutorButton({ scope, mode: 'hint' }).props.onClick()
  assert.deepEqual(detail, { ...scope, mode: 'hint' })
})

test('avaliação aberta omite os atalhos, enquanto prática permite ajuda contextual', async () => {
  practice = {
    round: { round: 1, finished_at: null }, total: 2, position: 1,
    question: { version: { id: 'version' }, options: [] },
    mistakes: [{ attemptId: 'attempt-1', position: 1 }],
  }
  async function renderRound(step) {
    const view = LearningActivity({ session: {}, enrollment: 'e', path, step, progress: {}, next: null })
    const activity = view.props.children
    return renderToStaticMarkup(await activity.type(activity.props))
  }
  const assessment = await renderRound(steps[3])
  assert.match(assessment, /Questão da rodada/)
  assert.match(assessment, /Assistente fica indisponível/)
  assert.doesNotMatch(assessment, /Pedir uma dica|Explicar assunto|Explicar meu erro/)
  const practiceHtml = await renderRound(steps[1])
  assert.match(practiceHtml, /Pedir uma dica/)
  assert.match(practiceHtml, /Rever erros desta prática/)
  assert.match(practiceHtml, /Explicar meu erro/)
})

test('catálogo de trilhas oferece atalhos para as três ferramentas recolhidas do menu lateral', async () => {
  const html = renderToStaticMarkup(await LearningCatalogPage())
  assert.match(html, /Ferramentas de estudo/)
  for (const href of ['assistente', 'feynman', 'grafo']) assert.ok(html.includes(`href="/dashboard/${href}"`))
})
