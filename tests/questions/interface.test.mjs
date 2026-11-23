import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const root = fileURLToPath(new URL('../..', import.meta.url))
const nodeRequire = createRequire(import.meta.url)
const loadedModules = new Map()

function loadComponent(path) {
  if (loadedModules.has(path)) return loadedModules.get(path)
  const state = { exports: {} }
  const source = readFileSync(path, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    fileName: path.replace(/\.mjs$/, '.ts'),
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  })

  const link = ({ children, ...props }) => {
    delete props.prefetch
    return createElement('a', props, children)
  }
  const loadDependency = (name) => {
    if (name === 'next/link') return link
    if (name === 'next/image') return function ImageFixture(props) {
      const attributes = { ...props }
      delete attributes.preload
      delete attributes.unoptimized
      return createElement('img', attributes)
    }
    if (name === '@ducanh2912/next-pwa') return (pwaOptions) => (config) => ({ ...config, pwaOptions })
    if (name === '@/actions/questions') return { submitQuestionAnswer: () => assert.fail('A renderização inicial não pode enviar uma resposta.') }
    if (name === '@/lib/questions/practice') return loadComponent(resolve(root, 'src/lib/questions/practice.ts'))
    if (name === '@/lib/questions/performance') return loadComponent(resolve(root, 'src/lib/questions/performance.ts'))
    if (name.startsWith('./')) return loadComponent(resolve(dirname(path), `${name}.tsx`))
    return nodeRequire(name)
  }

  new Function('module', 'exports', 'require', outputText)(state, state.exports, loadDependency)
  loadedModules.set(path, state.exports)
  return state.exports
}

const load = (name) => loadComponent(resolve(root, `src/components/questions/${name}.tsx`))
const { answerSubmission } = loadComponent(resolve(root, 'src/lib/questions/practice.ts'))
const render = (component, props) => renderToStaticMarkup(createElement(component, props))
const topic = { id: 'competency-1', slug: 'select-where', name: 'SQL · SELECT e WHERE' }
const options = Array.from({ length: 5 }, (_, index) => ({ id: `option-${index + 1}`, position: index + 1, body: `SELECT ${index + 1};` }))

test('catálogo mostra o volume, o desempenho e o link do assunto', () => {
  const { default: Catalog } = load('QuestionCatalog')
  const html = render(Catalog, { topics: [{ ...topic, count: 2, practiced: 1 }], total: 2, practiced: 1, stats: { correct: 3, incorrect: 1 } })
  assert.match(html, /Questões/)
  assert.match(html, /2 questões/)
  assert.match(html, /Acertos/)
  assert.match(html, /Erros/)
  assert.match(html, /1\/2 praticadas/)
  assert.match(html, /75%/)
  assert.match(html, /select-where\.webp/)
  assert.match(html, /href="\/dashboard\/questoes\/resolver\?assunto=select-where"/)
  assert.match(render(Catalog, { topics: [], total: 0, practiced: null, stats: null }), /Catálogo vazio/)
})

test('resolução inicial renderiza SQL, cinco opções e nenhum gabarito', () => {
  const { default: Practice } = load('QuestionPractice')
  const html = render(Practice, {
    question: { id: 'version', statement: 'Observe:\n\n```sql\nSELECT COUNT(*) FROM itens;\n```' },
    options, topic: topic.name, position: 1, total: 2, nextHref: '/proxima', backHref: '/dashboard/questoes', finishHref: '/historico',
  })
  assert.equal((html.match(/type="radio"/g) ?? []).length, 5)
  assert.match(html, /<pre[^>]*><code[^>]*><span class="q-sql-keyword">SELECT<\/span>/)
  assert.match(html, /<progress[^>]*value="1"[^>]*max="2"/)
  assert.match(html, /<button type="submit" disabled=""[^>]*>Confirmar resposta/)
  assert.doesNotMatch(html, /Entenda as alternativas|Resposta correta!|Próxima questão/)
})

test('feedback mostra o resultado do servidor e explica as cinco alternativas', () => {
  const { QuestionFeedback } = load('QuestionPractice')
  const feedback = {
    selectedOptionId: 'option-1', correctOptionId: 'option-2', isCorrect: false,
    options: options.map(({ id, position }) => ({ optionId: id, position, explanation: `Justificativa ${position}` })),
  }
  const html = render(QuestionFeedback, { feedback })
  assert.match(html, /Resposta incorreta/)
  assert.match(html, /Alternativa A(?:<!-- -->)? · Incorreta(?:<!-- -->)? · Sua resposta/)
  assert.match(html, /Alternativa B(?:<!-- -->)? · Correta/)
  assert.equal((html.match(/Justificativa \d/g) ?? []).length, 5)
  assert.match(render(QuestionFeedback, { feedback: { ...feedback, isCorrect: true, selectedOptionId: 'option-2' } }), /Resposta correta!/)
})

test('histórico mostra o filtro, preserva a versão na revisão e trata a lista vazia', () => {
  const { default: History } = load('QuestionHistory')
  const props = {
    stats: { correct: 4, incorrect: 1 }, performance: null, topics: [topic], errorsOnly: true, page: 1, totalPages: 1, count: 1,
    attempts: [{ id: 'attempt-1', question_version_id: 'older-version', is_correct: false, answered_at: '2026-11-20T12:00:00Z', question: { statement: 'Enunciado original', competency_id: topic.id } }],
  }
  const html = render(History, props)
  assert.match(html, /Revisar erros/)
  assert.match(html, /Errou/)
  assert.match(html, /versao=older-version&amp;origem=erros/)
  assert.match(html, /Enunciado original/)
  assert.match(render(History, { ...props, attempts: [] }), /Nenhum erro para revisar/)
  assert.match(render(History, { ...props, topicSlug: 'select-where' }), /assunto=select-where&amp;versao=older-version&amp;origem=erros/)
})

test('desempenho usa tentativas no período, com dias agrupados pelo horário de São Paulo', () => {
  const { lastStudyDays, summarizeRecentAttempts, percentage } = loadComponent(resolve(root, 'src/lib/questions/performance.ts'))
  const days = lastStudyDays(new Date('2026-11-20T01:00:00Z'))
  const sql = { competency_id: topic.id }
  const performance = summarizeRecentAttempts([
    { is_correct: true, answered_at: '2026-11-20T00:40:00Z', question: sql },
    { is_correct: false, answered_at: '2026-11-19T12:00:00Z', question: sql },
    { is_correct: true, answered_at: '2026-11-06T02:00:00Z', question: sql },
  ], days)
  assert.equal(days.length, 14)
  assert.deepEqual(performance.days.at(-1), { day: '2026-11-19', correct: 1, incorrect: 1 })
  assert.deepEqual(performance.competencies, [{ id: topic.id, correct: 1, incorrect: 1 }])
  assert.equal(percentage(0, 0), null)
  const { default: Performance } = load('QuestionPerformance')
  const html = render(Performance, { data: performance, topics: [topic] })
  assert.match(html, /50% de acerto/)
  assert.match(html, /1 acerto · 1 erro/)
})

test('realce de SQL mantém strings e comentários como texto', () => {
  const { default: SqlCode } = load('SqlCode')
  const html = renderToStaticMarkup(createElement(SqlCode, null, "SELECT '<dado>', 5 -- SELECT"))
  assert.match(html, /q-sql-keyword">SELECT/)
  assert.match(html, /q-sql-number">5/)
  assert.match(html, /&lt;dado&gt;/)
  assert.match(html, /q-sql-comment">-- SELECT/)
})

test('retentativa conserva a chave e a alternativa do primeiro envio', () => {
  const first = answerSubmission(null, 'version-1', 'option-1', () => 'request-1')
  assert.deepEqual(first, { versionId: 'version-1', optionId: 'option-1', requestId: 'request-1' })
  assert.equal(answerSubmission(first, 'version-1', 'option-2', () => assert.fail('Chave recriada')), first)
})

test('carregamento e erro têm estados próprios com instrução para continuar', () => {
  const { default: Loading } = loadComponent(resolve(root, 'src/app/dashboard/questoes/loading.tsx'))
  const { default: ErrorState } = loadComponent(resolve(root, 'src/app/dashboard/questoes/error.tsx'))
  assert.match(render(Loading), /role="status"[\s\S]*Carregando questões/)
  const html = render(ErrorState)
  assert.match(html, /Não foi possível carregar esta tela/)
  assert.match(html, /Tentar novamente/)
})

test('service worker mantém Questões, Trilhas e Assistente fora do cache de navegação', () => {
  const handlers = new Map()
  const worker = readFileSync(resolve(root, 'public/sw-custom.js'), 'utf8')
  runInNewContext(worker, {
    URL,
    self: { location: new URL('https://example.test'), addEventListener: (name, handler) => handlers.set(name, handler) },
  })
  const handleFetch = handlers.get('fetch')
  assert.equal(typeof handleFetch, 'function')
  for (const path of ['/dashboard/questoes', '/dashboard/questoes/resolver?versao=1', '/dashboard/questoes/historico?filtro=erros', '/dashboard/%71uest%6fes',
    '/dashboard/trilhas', '/dashboard/trilhas/sql-concursos-e-mercado?etapa=1', '/dashboard/%74rilhas/sql?revisao=1',
    '/dashboard/assistente', '/dashboard/%61ssistente?_rsc=1']) {
    handleFetch({ request: { url: `https://example.test${path}`, mode: 'navigate' }, respondWith: () => assert.fail('Worker interceptou uma rota privada.') })
  }
})

test('Workbox e cabeçalhos excluem as rotas privadas do cache de navegação', async () => {
  const { default: config } = loadComponent(resolve(root, 'next.config.mjs'))
  const { pwaOptions } = config
  assert.equal(pwaOptions.cacheOnFrontEndNav, false)
  assert.equal(pwaOptions.extendDefaultRuntimeCaching, true)

  const [rule] = pwaOptions.workboxOptions.runtimeCaching
  const matches = (path, sameOrigin = true) => rule.urlPattern({ url: new URL(path, 'https://example.test'), sameOrigin })
  assert.equal(rule.handler, 'NetworkOnly')
  assert.equal(rule.options.fetchOptions.cache, 'no-store')
  assert.equal(matches('/dashboard/questoes'), true)
  assert.equal(matches('/dashboard/questoes/historico?_rsc=123'), true)
  assert.equal(matches('/dashboard/%71uest%6fes'), true)
  assert.equal(matches('/dashboard/questoes', false), false)
  assert.equal(matches('/dashboard/revisoes'), false)
  assert.equal(matches('/dashboard/questoes-nova'), false)
  assert.equal(matches('/dashboard/trilhas/sql-concursos-e-mercado?_rsc=123'), true)
  assert.equal(matches('/dashboard/%74rilhas/sql?revisao=1'), true)
  assert.equal(matches('/dashboard/trilhas', false), false)
  assert.equal(matches('/dashboard/trilhas-arquivadas'), false)
  assert.equal(matches('/dashboard/assistente?_rsc=123'), true)
  assert.equal(matches('/dashboard/%61ssistente'), true)
  assert.equal(matches('/dashboard/assistente-teste'), false)
  assert.match((await config.headers()).find(({ source }) => source === '/dashboard/questoes/:path*').headers[0].value, /private, no-store/)
  assert.match((await config.headers()).find(({ source }) => source === '/dashboard/trilhas/:path*').headers[0].value, /private, no-store/)
  assert.match((await config.headers()).find(({ source }) => source === '/dashboard/assistente/:path*').headers[0].value, /private, no-store/)
})
