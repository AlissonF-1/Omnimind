import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import { pythonRuntimeSource } from '../../scripts/academy-runtime.mjs'

const runtime = await pythonRuntimeSource()
const worker = await readFile(new URL('../../public/academy/python-worker.js', import.meta.url), 'utf8')

// Uses fixed, synthetic fixtures exclusively. The application never executes student code in Node.
async function sample(code, input = '') {
  let result
  const realm = { setTimeout, clearTimeout, setImmediate, clearImmediate, postMessage: (value) => { result = value } }
  runInNewContext(runtime + '\n' + worker, realm, { timeout: 5000 })
  await realm.onmessage({ data: { code, input } })
  return result
}

test('o interpretador executa Python em um programa de entrada, condição e saída', async () => {
  const program = 'n = int(input())\nif n >= 3:\n    print("Pronto")\nelse:\n    print("Pendente")'
  const passing = await sample(program, '3')
  assert.equal(passing.status, 'ok', passing.message)
  assert.equal(passing.output.trimEnd(), 'Pronto')
  assert.equal((await sample(program, '2')).output.trimEnd(), 'Pendente')
  const syntax = await sample('if :\n    print(1)')
  assert.equal(syntax.status, 'error')
  assert.match(syntax.message, /SyntaxError/)
})

test('execução limita tempo, saída e importação de módulos', async () => {
  assert.equal((await sample('while True:\n    pass')).status, 'timeout')
  const verbose = await sample('print("a" * 5000)')
  assert.equal(verbose.status, 'error')
  assert.equal(verbose.output.length, 4000)
  assert.equal((await sample('import math')).status, 'error')
})

test('documento do executor usa CSP sem rede e o cliente exige origem opaca', async () => {
  const frame = await readFile(new URL('../../public/academy/python-frame.html', import.meta.url), 'utf8')
  const client = await readFile(new URL('../../src/lib/academy/python.ts', import.meta.url), 'utf8')
  const pwa = await readFile(new URL('../../next.config.mjs', import.meta.url), 'utf8')
  assert.match(frame, /default-src 'none'/)
  assert.match(frame, /connect-src 'none'/)
  assert.match(frame, /worker\?\.terminate\(\)/)
  assert.match(client, /setAttribute\('sandbox', 'allow-scripts'\)/)
  assert.match(client, /event\.origin !== 'null'/)
  assert.match(pwa, /publicExcludes: \[[^\]]*'!academy\/\*\*\/\*'/)
})
