import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import * as progress from '../../src/lib/learning/progress.ts'

const nodeRequire = createRequire(import.meta.url)
const link = ({ children, prefetch, ...props }) => {
  assert.equal(prefetch, false)
  return createElement('a', props, children)
}
const image = ({ src, alt }) => createElement('img', { src, alt })
const mocks = {
  'next/link': link,
  'next/image': image,
  '@/actions/learning': { beginLearningStepAction() {}, enrollLearningAction() {} },
  '@/lib/learning/progress': progress,
  './LearningForms': { LearningActionForm: ({ label }) => createElement('button', { type: 'submit' }, label) },
}

function load(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  })
  const exports = {}
  new Function('exports', 'require', outputText)(exports, (name) => mocks[name] ?? nodeRequire(name))
  return exports
}

const { LearningHero, LearningMap, LearningPathCard } = load('../../src/components/learning/LearningPresentation.tsx')
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
