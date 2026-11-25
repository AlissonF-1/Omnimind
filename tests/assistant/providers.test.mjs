import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import * as geminiSdk from '@google/genai'
import * as icons from 'lucide-react'
import { createElement, memo } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as jsxRuntime from 'react/jsx-runtime'
import ts from 'typescript'
import * as providers from '../../src/lib/assistant/providers.ts'
import * as contracts from '../../src/lib/assistant/contracts.ts'

function load(path, stubs, globals) {
  const source = readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  }, fileName: path })
  const exports = {}
  const require = (name) => {
    assert.ok(name in stubs, 'Importação não simulada: ' + name)
    return stubs[name]
  }
  new Function('exports', 'require', ...Object.keys(globals), compiled.outputText)(exports, require, ...Object.values(globals))
  return exports
}

function sse(...events) {
  const wire = events.map((event) => 'data: ' + (typeof event === 'string' ? event : JSON.stringify(event)) + '\r\n\r\n').join('')
  const bytes = new TextEncoder().encode(': ping\r\n\r\n' + wire)
  const body = new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7))
      controller.close()
    },
  })
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
}

const usage = { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 }
const stats = { inputTokens: 11, outputTokens: 7, totalTokens: 18 }
const delta = { choices: [{ delta: { content: 'Isso é SQL.' } }] }
const finish = { choices: [{ delta: {}, finish_reason: 'stop' }] }
const input = (provider) => ({
  provider, system: 'Instrução fixa', messages: [{ role: 'user', content: 'Mensagem privada simulada' }], maxOutputTokens: 512,
})

function fixture({ http = () => { throw new Error('Chamada inesperada') }, gemini = [], env = {} } = {}) {
  const calls = []
  const logs = []
  const generation = load('src/lib/assistant/generation.ts', {
    'server-only': {},
    './providers': providers,
    '@google/genai': {
      ThinkingLevel: { MINIMAL: 'MINIMAL', LOW: 'LOW' },
      GoogleGenAI: class {
        models = {
          async *generateContentStream(request) {
            calls.push({ provider: 'gemini', request })
            for (const chunk of gemini) yield chunk
          },
          async generateContent(request) {
            calls.push({ provider: 'gemini', request })
            return gemini[0]
          },
        }
      },
    },
  }, {
    process: { env: { GEMINI_API_KEY: 'fixture', GROQ_API_KEY: 'fixture', OPENROUTER_API_KEY: 'fixture', ...env } },
    fetch: (url, options) => {
      const request = JSON.parse(options.body)
      calls.push({ url, request })
      return http(url, options)
    },
    console: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
  })
  return { ...generation, calls, logs }
}

test('Gemini usa o SDK oficial, o perfil selecionado e a versão real sem expor raciocínio', async () => {
  const { generate, calls, logs } = fixture({
    env: { GEMINI_MODEL: 'gemini-1.5-flash-8b' },
    gemini: [
      { modelVersion: 'gemini-3.8-flash-002', candidates: [{ content: { parts: [{ text: 'Raciocínio interno', thought: true }, { text: 'Isso é SQL.' }] } }] },
      { candidates: [{ finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7, totalTokenCount: 18 } },
    ],
  })
  const frames = await Array.fromAsync(generate(input('gemini')))
  assert.deepEqual(calls.map(({ provider }) => provider), ['gemini'])
  assert.equal(calls[0].request.model, 'gemini-3.8-flash')
  assert.equal(calls[0].request.config.maxOutputTokens, 512)
  assert.equal(calls[0].request.config.thinkingConfig.thinkingLevel, 'LOW')
  assert.equal(calls[0].request.config.httpOptions.retryOptions.attempts, 1)
  assert.equal(calls[0].request.config.automaticContinuation, false)
  assert.equal(frames.find(({ type }) => type === 'text').data, 'Isso é SQL.')
  assert.deepEqual(frames.at(-1).data, { provider: 'gemini', model: 'gemini-3.8-flash-002', usage: stats })
  await Array.fromAsync(generate({ ...input('gemini'), eco: true }))
  assert.equal(calls[1].request.model, 'gemini-3.5-flash-lite')
  assert.equal(calls[1].request.config.thinkingConfig.thinkingLevel, 'MINIMAL')
  assert.doesNotMatch(JSON.stringify(logs), /Mensagem privada simulada|Raciocínio interno|Instrução fixa|fixture/)
})

function sdkFixture(t, respond) {
  const logs = []
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const endpoint = new URL(url)
    assert.equal(endpoint.origin, 'https://generativelanguage.googleapis.com')
    assert.equal(new Headers(init.headers).get('x-goog-api-key'), 'chave-ficticia')
    calls.push({ pathname: endpoint.pathname, format: endpoint.searchParams.get('alt'), body: JSON.parse(init.body) })
    return respond(endpoint)
  })
  const generation = load('src/lib/assistant/generation.ts', {
    'server-only': {}, './providers': providers, '@google/genai': geminiSdk,
  }, {
    process: { env: { GEMINI_API_KEY: 'chave-ficticia' } },
    console: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
  })
  return { ...generation, calls, logs }
}

test('SDK instalado usa v1beta para transmitir ambos os modelos Gemini', async (t) => {
  const { generate, calls } = sdkFixture(t, (endpoint) => {
    if (!endpoint.pathname.startsWith('/v1beta/')) return Response.json({ error: { code: 404, status: 'NOT_FOUND' } }, { status: 404 })
    const modelVersion = endpoint.pathname.split('/').at(-1).split(':')[0]
    return sse({ modelVersion, candidates: [{ content: { role: 'model', parts: [{ text: 'Exemplo SQL.' }] }, finishReason: 'STOP' }] })
  })
  for (const eco of [false, true]) {
    const events = await Array.fromAsync(generate({ ...input('gemini'), eco }))
    assert.deepEqual(events.at(-1), { type: 'text', data: 'Exemplo SQL.' })
  }
  assert.deepEqual(calls.map(({ pathname, format, body }) => [pathname, format, body.generationConfig.thinkingConfig.thinkingLevel]), [
    ['/v1beta/models/gemini-3.8-flash:streamGenerateContent', 'sse', 'LOW'],
    ['/v1beta/models/gemini-3.5-flash-lite:streamGenerateContent', 'sse', 'MINIMAL'],
  ])
})

test('SDK instalado classifica erros do Gemini e só registra metadados seguros sem contagem de tokens', async (t) => {
  const cases = [
    { status: 404, code: 'model' },
    { status: 429, code: 'quota' },
    { status: 400, code: 'credentials', reason: 'API_KEY_INVALID' },
    { status: 400, code: 'rejected' },
  ]
  let i = 0
  const { generate, calls, logs } = sdkFixture(t, () => {
    const { status, reason } = cases[i++]
    return Response.json({ error: {
      code: status, message: 'erro privado com chave-ficticia',
      details: reason ? [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason }] : [],
    } }, { status })
  })
  for (const { status, code } of cases) {
    await assert.rejects(Array.fromAsync(generate(input('gemini'))), (error) => {
      assert.equal(error.code, code)
      assert.doesNotMatch(error.message, /chave-ficticia|erro privado/)
      return true
    })
    assert.deepEqual(logs.at(-1), ['[assistant-generation]', {
      provider: 'gemini', requestedModel: 'gemini-3.8-flash', outcome: code, upstreamStatus: status,
    }])
  }
  assert.equal(calls.length, cases.length)
  assert.doesNotMatch(JSON.stringify(logs), /chave-ficticia|erro privado|Mensagem privada simulada/)
})

test('Groq usa GPT-OSS 120B ou 20B e lê x_groq.usage no stream', async () => {
  const { generate, calls } = fixture({
    http: () => sse({ ...delta, model: 'openai/gpt-oss-120b' }, { ...finish, x_groq: { usage } }, '[DONE]'),
  })
  const frames = await Array.fromAsync(generate(input('groq')))
  assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/chat/completions')
  assert.equal(calls[0].request.model, 'openai/gpt-oss-120b')
  assert.equal(calls[0].request.max_completion_tokens, 512)
  assert.deepEqual(frames.at(-1).data.usage, stats)
  await Array.fromAsync(generate({ ...input('groq'), eco: true }))
  assert.equal(calls[1].request.model, 'openai/gpt-oss-20b')
})

test('OpenRouter econômico registra o modelo e a hospedagem reais em vez do alias', async () => {
  const { generate, calls } = fixture({
    http: () => sse({ model: 'openrouter/free', choices: [] },
      { ...delta, model: 'google/gemma-4-31b-it:free', provider: 'Google' }, finish, { usage }, '[DONE]'),
  })
  const frames = await Array.fromAsync(generate({ ...input('openrouter'), eco: true }))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/chat/completions')
  assert.equal(calls[0].request.model, 'openrouter/free')
  assert.equal(calls[0].request.max_completion_tokens, 512)
  assert.equal(calls[0].request.provider.allow_fallbacks, false)
  assert.deepEqual(frames.at(-1).data, {
    provider: 'openrouter', model: 'google/gemma-4-31b-it:free', upstreamProvider: 'Google', usage: stats,
  })
  assert.ok(!frames.some(({ data }) => data?.model === 'openrouter/free'))
  await Array.fromAsync(generate(input('openrouter')))
  assert.equal(calls[1].request.model, 'openai/gpt-oss-20b')
})

for (const [status, code] of [[401, 'credentials'], [403, 'forbidden'], [429, 'quota'], [402, 'quota'], [404, 'model'], [503, 'unavailable']]) {
  test('classifica HTTP ' + status + ' e não vaza o corpo de erro nem troca de provedor', async () => {
    const { generate, calls } = fixture({ http: () => Response.json({ error: 'Detalhe privado com credencial simulada' }, { status }) })
    await assert.rejects(Array.fromAsync(generate(input('groq'))), (error) => {
      assert.equal(error.code, code)
      assert.doesNotMatch(error.message, /credencial simulada/)
      return true
    })
    assert.equal(calls.length, 1)
  })
}

test('detecta configuração ausente, resposta em branco, JSON inválido e contexto acima do limite', async () => {
  const unconfigured = fixture({ env: { GROQ_API_KEY: undefined } })
  await assert.rejects(Array.fromAsync(unconfigured.generate(input('groq'))), { code: 'configuration' })
  assert.equal(unconfigured.calls.length, 0)
  const empty = fixture({ http: () => sse({ choices: [{ delta: { content: '  ' } }] }, finish, '[DONE]') })
  await assert.rejects(Array.fromAsync(empty.generate(input('groq'))), { code: 'empty' })
  const invalid = fixture({ http: () => sse('{json malformado}') })
  await assert.rejects(Array.fromAsync(invalid.generate(input('groq'))), { code: 'invalid' })
  const large = { ...input('groq'), messages: [{ role: 'user', content: 'é'.repeat(33_000) }] }
  await assert.rejects(Array.fromAsync(invalid.generate(large)), { code: 'input' })
  assert.equal(invalid.calls.length, 1)
})

test('cancela a espera e propaga timeout através do sinal para a rede', async () => {
  const { generate, calls } = fixture({
    http: async (_url, { signal }) => { await delay(1000, null, { signal }); throw new Error('timeout ausente') },
  })
  await assert.rejects(Array.fromAsync(generate({ ...input('groq'), timeoutMs: 10 })), { code: 'timeout' })
  const controller = new AbortController()
  const result = Array.fromAsync(generate({ ...input('openrouter'), signal: controller.signal }))
  controller.abort()
  await assert.rejects(result, { code: 'cancelled' })
  assert.equal(calls.length, 2)
})

test('erros do OpenRouter no meio do stream e encerramentos precoces preservam texto e rejeitam o resultado', async () => {
  for (const response of [
    () => sse(delta, { error: { code: 502 }, choices: [{ finish_reason: 'error' }] }, '[DONE]'),
    () => sse(delta, finish),
    () => sse(delta, '[DONE]'),
  ]) {
    const { generate, calls } = fixture({ http: response })
    const stream = generate(input('openrouter'))
    assert.deepEqual((await stream.next()).value, { type: 'text', data: 'Isso é SQL.' })
    await assert.rejects(stream.next(), { provider: 'openrouter' })
    assert.equal(calls.length, 1)
  }
})

test('cancelamento durante o stream chega ao provedor e evita concatenar conteúdo', async () => {
  const controller = new AbortController()
  const { generate, calls } = fixture({
    http: (_url, { signal }) => new Response(new ReadableStream({
      start(stream) {
        stream.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(delta) + '\n\n'))
        signal.addEventListener('abort', () => stream.error(signal.reason), { once: true })
      },
    }), { headers: { 'content-type': 'text/event-stream' } }),
  })
  const stream = generate({ ...input('groq'), signal: controller.signal })
  assert.equal((await stream.next()).value.data, 'Isso é SQL.')
  controller.abort()
  await assert.rejects(stream.next(), { code: 'cancelled' })
  assert.equal(calls.length, 1)
})

test('cliente lê o protocolo do Assistente, trata desconexão e distingue sessão expirada de falha da IA', async () => {
  const calls = []
  const packets = [
    new Response('{"type":"text","data":"Trecho"}\n', { headers: { 'content-type': 'application/x-ndjson' } }),
    Response.json({ error: 'Groq sem acesso', canRetry: true }, { status: 502 }),
    Response.json({ error: 'Sessão expirada' }, { status: 401 }),
    new Response('{"type":"text","data":"Tudo certo"}\n{"type":"done","data":null}\n', { headers: { 'content-type': 'application/x-ndjson' } }),
  ]
  const { readAssistantReply } = load('src/lib/assistant/reply.ts', {}, {
    fetch: async (url, options) => { calls.push({ url, options }); return packets.shift() },
  })
  const signal = new AbortController().signal
  const request = { model: 'groq' }
  const stream = readAssistantReply(request, signal)
  assert.equal((await stream.next()).value.data, 'Trecho')
  await assert.rejects(stream.next(), { canRetry: false, sessionChanged: false })
  await assert.rejects(Array.fromAsync(readAssistantReply(request, signal)), { message: 'Groq sem acesso', canRetry: true, sessionChanged: false })
  await assert.rejects(Array.fromAsync(readAssistantReply(request, signal)), { canRetry: false, sessionChanged: true })
  assert.deepEqual(await Array.fromAsync(readAssistantReply(request, signal)), [{ type: 'text', data: 'Tudo certo' }])
  assert.equal(calls.length, 4)
  assert.ok(calls.every(({ url, options }) => url === '/api/chat' && options.cache === 'no-store'))
})

test('mensagem do Assistente mostra modelo e hospedagem reais junto à resposta parcial', () => {
  const { default: AssistantMessage } = load('src/components/assistant/AssistantMessage.tsx', {
    'react/jsx-runtime': jsxRuntime, react: { memo }, 'lucide-react': icons, 'next/link': {},
    'react-markdown': { default: ({ children }) => createElement('p', null, children) }, 'remark-gfm': {},
    '@/lib/assistant/contracts': contracts, '@/lib/assistant/providers': providers,
  }, {})
  const render = (message) => renderToStaticMarkup(createElement(AssistantMessage, { message, pending: false }))
  const markup = render({
    role: 'ai', content: 'Trecho recebido.', interruption: 'A resposta foi interrompida.',
    generation: { provider: 'openrouter', model: 'google/gemma-4-31b-it:free', upstreamProvider: 'Google' },
  })
  assert.match(markup, /OpenRouter · google\/gemma-4-31b-it:free · Google/)
  assert.match(markup, /Trecho recebido\./)
  assert.match(markup, /role="alert"[^>]*>A resposta foi interrompida/)
  assert.match(render({ role: 'ai', content: 'Trecho', generation: { provider: 'gemini' } }), /Modelo não informado/)
})
