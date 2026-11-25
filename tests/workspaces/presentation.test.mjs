import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const URLRoot = '../../'
function load(path, mocks = {}) {
  const source = readFileSync(new URL(URLRoot + path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  })
  const exports = {}
  new Function('exports', 'require', outputText)(exports, (name) => name in mocks ? mocks[name] : require(name))
  return exports.default
}

const createLink = ({ children, ...props }) => createElement('a', props, children)
const image = ({ src, alt }) => createElement('img', { src, alt })
const render = (component, props) => renderToStaticMarkup(createElement(component, props))
const workspace = {
  id: 'workspace-1', name: 'Banco de Dados', description: 'Estudo de SQL', created_at: '2026-11-24T12:00:00Z',
  mastery_level: 2, mastery_xp: 135, is_sprint_mode: false, sprint_date: null,
}

async function fixture({ options = {}, notes = [], counts = {} } = {}) {
  const calls = []
  const Page = load('src/app/dashboard/[workspaceId]/page.tsx', {
    './workspace.css': {},
    'next/image': image,
    'next/link': createLink,
    'next/navigation': { notFound: () => { throw new Error('notFound') }, redirect: (path) => { throw new Error(path) } },
    '@/actions/notes': {
      getNotes: async (id, query) => { calls.push(['list', id, query]); return notes },
      createNote: async (id) => { calls.push(['create', id]); return 'nota-nova' },
    },
    '@/actions/stats': { getWorkspaceFlashcardCounts: async () => counts },
    '@/actions/workspaces': { getWorkspaceById: async () => workspace },
    '@/components/SprintControl': () => createElement('div', null, 'Sprint'),
    '@/components/WorkspaceFilterBar': ({ initialSearch }) => createElement('label', null, 'Filtro: ' + initialSearch),
    '@/components/WorkspaceNotesGrid': ({ initialNotes }) => createElement('ul', null,
      initialNotes.map(({ id, title }) => createElement('li', { key: id }, title))),
  })
  const page = await Page({ params: Promise.resolve({ workspaceId: workspace.id }), searchParams: Promise.resolve(options) })
  return { page, calls, html: renderToStaticMarkup(page) }
}

function visit(node, match) {
  if (Array.isArray(node)) return node.flatMap((child) => visit(child, match))
  if (!node?.props) return []
  return [...(match(node) ? [node] : []), ...visit(node.props.children, match)]
}

test('workspace vazio preserva o progresso real e as duas ações de criar nota', async () => {
  const { page, calls, html } = await fixture()
  assert.match(html, /Este workspace está vazio/)
  assert.match(html, /workspace-notes\.webp/)
  assert.match(html, /<progress[^>]*value="35"[^>]*max="100"/)
  assert.match(html, /65 XP para evoluir/)
  const createForms = visit(page, (node) => typeof node.props.action === 'function')
  assert.equal(createForms.length, 2)
  await assert.rejects(createForms[1].props.action(), /\/dashboard\/workspace-1\/note\/nota-nova/)
  assert.deepEqual(calls.at(-1), ['create', workspace.id])
})

test('resultado vazio mantém a busca acessível e os totais do workspace', async () => {
  const { html, calls } = await fixture({ options: { search: 'joins', sort: 'name' }, counts: { a: 0, b: 2 } })
  assert.match(html, /Nenhuma nota encontrada/)
  assert.match(html, /Filtro: joins/)
  assert.match(html, /0 resultados encontrados/)
  assert.match(html, /2 notas/)
  assert.match(html, /2 flashcards/)
  assert.match(html, /href="\/dashboard\/workspace-1\?sort=name"/)
  assert.deepEqual(calls[0], ['list', workspace.id, { search: 'joins', sort: 'name' }])
})

test('a ordenação por flashcards continua usando as quantidades existentes', async () => {
  const { html } = await fixture({ options: { sort: 'cards' },
    notes: [{ id: 'a', title: 'Projeção' }, { id: 'b', title: 'Junções' }], counts: { a: 1, b: 4 } })
  assert.match(html, /5 flashcards/)
  assert.match(html, /<li>Junções<\/li><li>Projeção<\/li>/)
})

test('Modo Sprint mantém data, ações e estado ativo acessíveis', () => {
  const Sprint = load('src/components/SprintControl.tsx', { '@/actions/workspaces': { toggleSprintMode: async () => {} } })
  const html = render(Sprint, { workspaceId: workspace.id, isSprintMode: false, sprintDate: null, today: '2026-11-24' })
  assert.match(html, /Data da prova/)
  assert.match(html, /type="date"[^>]*min="2026-11-24"/)
  assert.match(html, /type="submit"[^>]*disabled=""[\s\S]*Ativar Sprint/)
  const active = render(Sprint, {
    workspaceId: workspace.id, isSprintMode: true, sprintDate: '2026-11-25T00:00:00Z', today: '2026-11-24',
  })
  assert.match(active, /1 dia para a prova/)
  assert.match(active, /Revisão prioritária/)
  assert.match(active, /Desativar Sprint/)
})
