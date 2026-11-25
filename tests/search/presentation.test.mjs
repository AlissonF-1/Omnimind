import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import * as searchTypes from '../../src/types/search.ts'

const nodeRequire = createRequire(import.meta.url)
const modules = {
  'next/link': ({ children, href, ...props }) => createElement('a', { ...props, href }, children),
  'next/image': ({ src, sizes, alt }) => createElement('img', { src, sizes, alt }),
  '@/actions/search': { semanticSearch: () => assert.fail('A renderização não deve consultar o provedor.') },
  '@/actions/embeddings': { backfillEmbeddings: () => assert.fail('A renderização não deve indexar conteúdo.') },
  '@/actions/workspaces': { getWorkspaces: async () => [] },
  '@/types/search': searchTypes,
  './search.css': {},
}

function load(path, stubs = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  })
  const exports = {}
  new Function('exports', 'require', outputText)(exports, (name) => stubs[name] ?? modules[name] ?? nodeRequire(name))
  return exports
}

const { default: Search, SemanticResultCard } = load('../../src/components/SemanticSearch.tsx')
modules['@/components/SemanticSearch'] = Search
const { default: SearchPage } = load('../../src/app/dashboard/busca/page.tsx')
const render = (component, props) => renderToStaticMarkup(createElement(component, props))

test('a busca mantém o formulário rotulado, a seleção de workspace e o botão de indexação', () => {
  const html = render(Search, { workspaces: [{ id: 'sql', name: 'SQL' }] })
  assert.match(html, /role="search" aria-label="Busca semântica"/)
  assert.match(html, /<label for="semantic-query">O que você quer relembrar?/)
  assert.match(html, /enterKeyHint="search"/)
  assert.ok(html.includes('<option value="sql">SQL</option>'))
  assert.match(html, /Busca automática/)
  assert.match(html, /Indexar conteúdo/)
  assert.match(html, /<button type="submit"[^>]* disabled=""/)
  assert.doesNotMatch(render(Search, { workspaces: [], autoSearch: false }), /Busca automática/)
})

test('resultado preserva o link, o texto escapado e o acesso aos trechos relacionados', () => {
  const html = render(SemanticResultCard, { query: 'x+y', result: {
    id: 'search-1', sourceId: 'note-1', sourceType: 'note', workspaceName: 'SQL',
    noteTitle: 'Funções', chunkText: 'Some x+y. <script>não executar</script>',
    href: '/dashboard/sql/note/note-1', similarity: .91,
    additionalChunks: [{ id: 'second', chunkText: 'Outro trecho x+y.', similarity: .72 }],
  } })
  assert.match(html, /href="\/dashboard\/sql\/note\/note-1"/)
  assert.match(html, /91% de similaridade/)
  assert.match(html, /<mark>x\+y<\/mark>/)
  assert.match(html, /&lt;script&gt;não executar&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /<details[^>]*><summary>Mais trechos desta nota \(1\)/)
})

test('o cabeçalho usa a ilustração local e o suspense tem um estado de carregamento identificado', () => {
  const html = render(SearchPage)
  assert.match(html, /src="\/images\/dashboard\/brain.webp"/)
  assert.match(html, /<h1>Busca semântica<\/h1>/)
  assert.match(html, /role="status".*Carregando workspaces/)
})

test('uma resposta anterior não repõe resultados após limpar a consulta e a repetição de indexação usa a ação correta', async () => {
  let index = 0
  const values = []
  function slot(initial) {
    const current = index++
    if (!(current in values)) values[current] = initial
    return current
  }
  const hooks = {
    useState(initial) {
      const current = slot(initial)
      return [values[current], (next) => { values[current] = typeof next === 'function' ? next(values[current]) : next }]
    },
    useRef(initial) { return values[slot({ current: initial })] },
    useCallback(callback) { return callback },
    useMemo(factory) { return factory() },
    useEffect() {},
  }
  let resolveSearch
  let searches = 0
  let indexing = 0
  const { default: InteractiveSearch } = load('../../src/components/SemanticSearch.tsx', {
    react: hooks,
    '@/actions/search': { semanticSearch: () => { searches += 1; return new Promise((resolve) => { resolveSearch = resolve }) } },
    '@/actions/embeddings': { backfillEmbeddings: async () => {
      indexing += 1
      return indexing === 1 ? { error: 'Índice indisponível' } : { notesIndexed: 1, cardsIndexed: 0 }
    } },
  })
  function tree() {
    index = 0
    return InteractiveSearch({ workspaces: [], autoSearch: false })
  }
  function find(node, match) {
    if (!node || typeof node !== 'object') return undefined
    if (match(node)) return node
    for (const child of [node.props?.children].flat(Infinity)) {
      const result = find(child, match)
      if (result) return result
    }
  }
  const input = (value) => find(tree(), (node) => node.type === 'input').props.onChange({ target: { value } })
  input('joins')
  find(tree(), (node) => node.type === 'form').props.onSubmit({ preventDefault() {} })
  assert.equal(searches, 1)
  input('')
  resolveSearch({ results: [{ id: 'old', sourceType: 'note', href: '/antigo', chunkText: 'antigo' }] })
  await Promise.resolve()
  assert.equal(find(tree(), (node) => node.props?.className === 'ss-result-list'), undefined)
  find(tree(), (node) => node.props?.className === 'ss-button ss-secondary').props.onClick()
  await Promise.resolve()
  const alert = find(tree(), (node) => node.props?.role === 'alert')
  find(alert, (node) => node.type === 'button').props.onClick()
  await Promise.resolve()
  assert.equal(indexing, 2)
  assert.equal(searches, 1)
  assert.ok(find(tree(), (node) => node.props?.className === 'ss-notice ss-success'))
})
