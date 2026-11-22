import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const render = (component, props) => renderToStaticMarkup(createElement(component, props))

function load(name, fixtures = {}) {
  const source = readFileSync(new URL(`../../src/components/${name}.tsx`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    },
  })
  const dependencies = (moduleName) => {
    if (moduleName in fixtures) return fixtures[moduleName]
    if (moduleName === 'next/image') return function ImageFixture({ src, alt, width, height, className }) {
      return createElement('img', { src, alt, width, height, className })
    }
    if (moduleName === 'next/link') return function LinkFixture(props) {
      return createElement('a', props)
    }
    if (moduleName.startsWith('@/') || moduleName === './RelearningAlert') return {}
    return require(moduleName)
  }
  const state = { exports: {} }
  new Function('module', 'exports', 'require', outputText)(state, state.exports, dependencies)
  return state.exports.default
}

async function workspaceMarkup({ workspaces, flashcards = [], sprints = [], error = null, cardsError = null }) {
  const Selector = load('WorkspaceSelector', {
    '@/utils/supabase/server': {
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'estudante' } } }) },
        from: (table) => ({
          select: () => {
            const filters = new Map()
            const query = {
              eq: (key, value) => { filters.set(key, value); return query },
              gte: () => query,
              then: (resolve) => resolve(table === 'flashcards'
                ? { data: flashcards, error: cardsError }
                : filters.has('is_sprint_mode') ? { data: sprints } : { data: workspaces, error }),
            }
            return query
          },
        }),
      }),
    },
  })
  return renderToStaticMarkup(await Selector())
}

const future = '2100-01-01T00:00:00.000Z'
const past = '2000-01-01T00:00:00.000Z'

test('fila conta cartões novos, vencidos e de sprint, sem incluir workspaces arquivados', async () => {
  const html = await workspaceMarkup({
    workspaces: [
      { id: 'sql', name: 'SQL', description: 'Consultas e bancos de dados' },
      { id: 'ti', name: 'Fundamentos de TI' },
      { id: 'arquivo', name: 'Área arquivada', is_archived: true },
    ],
    flashcards: [
      { due: null, state: 0, notes: [{ workspace_id: 'sql' }] },
      { due: past, state: 2, notes: { workspace_id: 'sql' } },
      { due: future, state: 2, notes: { workspace_id: 'ti' } },
      { due: past, state: 2, notes: { workspace_id: 'arquivo' } },
    ],
    sprints: [{ id: 'ti' }],
  })
  assert.match(html, /3 cards na fila/)
  assert.match(html, /2 pendentes/)
  assert.match(html, /1 pendente/)
  assert.match(html, /href="\/dashboard\/revisoes\?workspaceId=sql"/)
  assert.doesNotMatch(html, /Área arquivada/)
})

test('a fila diferencia conta vazia, erro na consulta e contagem indisponível', async () => {
  assert.match(await workspaceMarkup({ workspaces: [] }), /Crie seu primeiro workspace/)
  assert.match(await workspaceMarkup({ error: new Error('teste') }), /Não foi possível carregar os workspaces/)
  const html = await workspaceMarkup({ workspaces: [{ id: 'sql', name: 'SQL' }], cardsError: new Error('teste') })
  assert.match(html, /Contagem indisponível/)
  assert.doesNotMatch(html, /Em dia/)
})

function loadReview() {
  return load('ReviewPanel', {
    '@/contexts/SettingsContext': { useSettings: () => ({ settings: {} }) },
    '@/hooks/useOfflineSync': { useOfflineSync: () => ({ isOnline: true, pendingCount: 0 }) },
    '@/components/OfflineBanner': () => null,
  })
}

test('a frente do flashcard começa com zero respostas e oferece um botão de revelar', () => {
  const card = { id: 'sql-where', front: 'Qual é a função de WHERE?', back: 'Filtra linhas', notes: { title: 'Consultas SQL' } }
  const html = render(loadReview(), { initialCards: [card] })
  assert.match(html, /Cartão 1 de 1/)
  assert.match(html, /<progress value="0" max="1" aria-label="Progresso da sessão"/)
  assert.match(html, /Qual é a função de WHERE\?/)
  assert.match(html, /Revelar resposta/)
  assert.match(html, /aria-pressed="false"[^>]*title="Modo Batalha/)
  assert.doesNotMatch(html, /Filtra linhas|class="rv-ratings"/)
})

test('a fila vazia tem texto próprio para a revisão padrão e para o Ultimato', () => {
  const Panel = loadReview()
  const general = render(Panel, { initialCards: [] })
  const ultimatum = render(Panel, { initialCards: [], mode: 'ultimato' })
  assert.match(general, /Tudo em dia/)
  assert.match(general, /empty_state_astronaut\.png/)
  assert.match(ultimatum, /Sem cards para o Ultimato/)
  assert.doesNotMatch(ultimatum, /Sessão concluída/)
})
