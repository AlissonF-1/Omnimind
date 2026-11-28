import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash, timingSafeEqual } from 'node:crypto'
import test from 'node:test'
import ts from 'typescript'
import { parsePushSubscription } from '../../src/lib/push/subscription.ts'
import * as pdfContract from '../../src/lib/pdf/import-contract.ts'
import * as noteImages from '../../src/lib/note-image.ts'

const workspace = '00000000-0000-4000-8000-000000000001'
const accountA = '00000000-0000-4000-8000-000000000002'
const accountB = '00000000-0000-4000-8000-000000000003'
const validPath = workspace + '/fixture.pdf'
const validSubscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/fixture',
  keys: { auth: 'A'.repeat(22), p256dh: 'B'.repeat(87) },
}
const next = { NextResponse: { json: (body, init) => Response.json(body, init) } }

function load(path, stubs, globals = {}) {
  const source = readFileSync(new URL('../../src/' + path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } })
  const exports = {}
  new Function('exports', 'require', ...Object.keys(globals), outputText)(exports, (name) => {
    assert.ok(name in stubs, 'Unexpected module: ' + name)
    return stubs[name]
  }, ...Object.values(globals))
  return exports
}

test('PDF validates a workspace object path without accepting URLs or arbitrary paths', () => {
  assert.deepEqual(pdfContract.parsePdfPath(validPath), { path: validPath, workspaceId: workspace })
  for (const path of ['https://example.test/file.pdf', '../file.pdf', workspace + '/nested/file.pdf', validPath + '\n', workspace + '/file.txt']) {
    assert.equal(pdfContract.parsePdfPath(path), null)
  }
})

test('PDF requires login and workspace ownership, and bounds streamed files before parsing', async () => {
  const checked = []
  const downloaded = []
  let user = null
  let ownsWorkspace = false
  let bytes = Buffer.from('%PDF-1.4\nSynthetic')
  let parses = 0
  class PDFParse {
    constructor(options) {
      parses++
      assert.equal(options.isEvalSupported, false)
    }
    async getText({ first }) {
      assert.equal(first, 60)
      return { text: 'Texto extraído' }
    }
    async destroy() {}
  }
  const { POST } = load('app/api/pdf/extract/route.ts', {
    'next/server': next, 'pdf-parse': { PDFParse },
    '@/lib/pdf/import-contract': pdfContract,
    '@/lib/assistant/generation': { generateText: async () => { throw new Error('Mock provider unavailable') } },
    '@/utils/supabase/server': { createClient: async () => ({
      auth: { getUser: async () => ({ data: { user } }) },
      from: (table) => {
        assert.equal(table, 'workspaces')
        const query = {
          select: () => query,
          eq: (key, value) => { checked.push([key, value]); return query },
          abortSignal: () => query,
          maybeSingle: async () => ({ data: ownsWorkspace ? { id: workspace } : null }),
        }
        return query
      },
      storage: { from: (bucket) => {
        assert.equal(bucket, pdfContract.pdfImportBucket)
        return { download: (path) => {
          downloaded.push(path)
          return { asStream: async () => ({ data: new Response(bytes).body }) }
        } }
      } },
    }) },
  })
  const send = (payload) => POST(new Request('http://local.test/api/pdf/extract', { method: 'POST', body: JSON.stringify(payload) }))
  assert.equal((await send({ filePath: validPath })).status, 401)
  user = { id: accountA }
  assert.equal((await send({ signedUrl: 'https://example.test/file.pdf' })).status, 400)
  assert.equal((await send({ filePath: validPath })).status, 404)
  assert.deepEqual(checked, [['id', workspace], ['user_id', accountA]])
  assert.deepEqual(downloaded, [])
  ownsWorkspace = true
  const success = await send({ filePath: validPath })
  assert.match(success.headers.get('cache-control'), /no-store/)
  assert.equal((await success.json()).structured.sections[0].text, 'Texto extraído')
  bytes = Buffer.alloc(pdfContract.maxPdfBytes + 1)
  assert.equal((await send({ filePath: validPath })).status, 413)
  bytes = Buffer.from('Text with an incorrect header')
  assert.equal((await send({ filePath: validPath })).status, 415)
  assert.equal(parses, 1)
})

test('legacy image URLs for the configured project resolve to the session-protected endpoint', () => {
  const origin = 'https://app-project.supabase.co'
  const path = workspace + '/0.12345.png'
  const oldUrl = '/storage/v1/object/public/note_images/' + path
  assert.equal(noteImages.replaceLegacyNoteImageUrl(origin + oldUrl, origin), noteImages.noteImageUrl(path))
  assert.equal(noteImages.replaceLegacyNoteImageUrl('https://external.test' + oldUrl, origin), 'https://external.test' + oldUrl)
  assert.equal(noteImages.parseNoteImagePath(path + '\n'), null)
  assert.equal(noteImages.parseNoteImagePath(workspace + '/other/fixture.png'), null)
})

test('note image endpoint checks the session and note owner before reading private storage', async () => {
  const queries = []
  let owner = null
  let downloads = 0
  let mime = 'image/png'
  const { GET } = load('app/api/notes/image/route.ts', {
    '@/lib/note-image': noteImages,
    '@/utils/supabase/server': { createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: owner && { id: owner } } }) },
      from: (table) => {
        assert.equal(table, 'notes')
        const query = {
          select: () => query,
          eq: (key, value) => { queries.push([key, value]); return query },
          abortSignal: () => query,
          maybeSingle: async () => ({ data: owner === accountA ? { id: workspace } : null }),
        }
        return query
      },
      storage: { from: (bucket) => {
        assert.equal(bucket, noteImages.noteImageBucket)
        return { download: async () => {
          downloads++
          return { data: new Blob(['fixture'], { type: mime }) }
        } }
      } },
    }) },
  })
  const request = () => new Request('http://local.test' + noteImages.noteImageUrl(workspace + '/fixture.png'))
  assert.equal((await GET(request())).status, 401)
  owner = accountB
  assert.equal((await GET(request())).status, 404)
  assert.deepEqual(queries, [['id', workspace], ['user_id', accountB]])
  assert.equal(downloads, 0)
  owner = accountA
  const response = await GET(request())
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'image/png')
  assert.match(response.headers.get('cache-control'), /no-store/)
  mime = 'text/html'
  assert.equal((await GET(request())).status, 415)
})

test('Push accepts browser endpoints and checks scheme, hostname and keys', () => {
  assert.deepEqual(parsePushSubscription(validSubscription), validSubscription)
  for (const endpoint of ['http://fcm.googleapis.com/a', 'https://fcm.googleapis.com.example.test/a',
    'https://example.test/a', 'https://fcm.googleapis.com:8443/a']) {
    assert.equal(parsePushSubscription({ ...validSubscription, endpoint }), null)
  }
  assert.equal(parsePushSubscription({ ...validSubscription, keys: {} }), null)
})

test('Cron denies unauthorized requests and only uses the scoped RPC and trusted destinations', async () => {
  const calls = []
  const sent = []
  const env = {
    CRON_SECRET: 'synthetic-route-secret', PUSH_DB_TOKEN: 'a'.repeat(64),
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic',
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'synthetic', VAPID_PRIVATE_KEY: 'synthetic',
  }
  let rpcError = null
  const { GET } = load('app/api/push/send/route.ts', {
    'next/server': next, 'node:crypto': { createHash, timingSafeEqual },
    '@/lib/push/subscription': { parsePushSubscription },
    'web-push': {
      setVapidDetails: () => undefined,
      sendNotification: async (subscription, message) => sent.push([subscription, JSON.parse(message)]),
    },
    '@supabase/supabase-js': { createClient: () => ({
      rpc: (name, parameters) => {
        calls.push([name, parameters])
        return { abortSignal: async () => ({
          error: rpcError,
          data: [
            { subscription: validSubscription, due_count: 2, workspace_id: workspace, streak: 1, daily_goal: 10 },
            { subscription: { ...validSubscription, endpoint: 'https://example.test/untrusted' }, due_count: 0 },
          ],
        }) }
      },
    }) },
  }, { process: { env } })
  const send = (token) => GET(new Request('https://local.test/api/push/send', { headers: token ? { Authorization: 'Bearer ' + token } : {} }))
  assert.equal((await send()).status, 401)
  assert.equal((await send('incorrect')).status, 401)
  assert.deepEqual(calls, [])
  const result = await send(env.CRON_SECRET)
  assert.deepEqual(await result.json(), { success: false, notifiedCount: 1, errorCount: 1 })
  assert.deepEqual(calls, [['get_scheduled_push_targets', { p_token: env.PUSH_DB_TOKEN }]])
  assert.equal(sent[0][1].data.url, 'https://omnimind-tau.vercel.app/dashboard/revisoes?workspaceId=' + workspace)
  rpcError = { code: '42501' }
  assert.equal((await send(env.CRON_SECRET)).status, 503)
  assert.equal(sent.length, 1)
})

test('offline review queues use a distinct namespace per account', async () => {
  const opens = []
  const indexedDB = {
    open: (name) => {
      opens.push(name)
      const request = {}
      queueMicrotask(() => {
        request.result = {
          transaction: () => ({ objectStore: () => ({ getAll: () => {
            const result = { result: [] }
            queueMicrotask(() => result.onsuccess())
            return result
          } }) }),
        }
        request.onsuccess()
      })
      return request
    },
  }
  const { getPendingReviews } = load('utils/offlineStore.ts', {}, {
    indexedDB, window: { indexedDB }, console: { error: () => undefined },
  })
  await getPendingReviews(accountA)
  await getPendingReviews(accountB)
  await getPendingReviews('default')
  assert.deepEqual(opens, ['omnimind_offline_account:' + accountA, 'omnimind_offline_account:' + accountB])
})
