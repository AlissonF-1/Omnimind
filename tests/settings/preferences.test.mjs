import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createUiRequire } from '../helpers/icon-imports.mjs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const require = createUiRequire(import.meta.url)

function load(file, fixtures = {}) {
  const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    },
  })
  const dependencies = (name) => {
    if (Object.hasOwn(fixtures, name)) return fixtures[name]
    if (name === 'next/link') return function LinkFixture(props) { return createElement('a', props) }
    return require(name)
  }
  const state = { exports: {} }
  new Function('module', 'exports', 'require', outputText)(state, state.exports, dependencies)
  return state.exports
}

const preferences = load('src/types/settings.ts')
const { DEFAULT_PREFERENCES, DELETE_STUDY_DATA_CONFIRMATION, isValidDailyGoal } = preferences

function database(respond) {
  return () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'estudante' } } }) },
    from: (table) => {
      const request = { table, method: 'read', where: [] }
      const query = {
        select: () => query,
        update: () => { request.method = 'update'; return query },
        delete: () => { request.method = 'delete'; return query },
        eq: (field, value) => { request.where.push([field, value]); return query },
        gte: () => query,
        order: () => query,
        limit: () => query,
        neq: () => query,
        lte: () => query,
        in: () => query,
        maybeSingle: () => query,
        then: (resolve) => resolve(respond(request)),
      }
      return query
    },
  })
}

function loadAction(name, createClient) {
  return load('src/actions/' + name + '.ts', {
    '@/utils/supabase/server': { createClient },
    '@/types/settings': preferences,
    'next/cache': { revalidatePath: () => {} },
  })
}

test('a meta aceita números inteiros de 1 a 100 e valores inválidos são recusados antes de gravar', async () => {
  assert.deepEqual([1, 10, 100, 0, 101, 4.5, '9', NaN].map(isValidDailyGoal), [true, true, true, false, false, false, false, false])
  const { updateUserPreferences } = loadAction('settings', () => assert.fail('Meta inválida não deve consultar o banco.'))
  await assert.rejects(updateUserPreferences({ daily_goal_default: 104 }), /Meta diária inválida/)
})

test('a meta padrão usa a preferência salva e uma prova mantém a prioridade', async () => {
  let exam = null
  let storedGoal = 18
  const calls = []
  const { getDynamicDailyGoal } = loadAction('calendar', database(({ table }) => {
    calls.push(table)
    if (table === 'exam_goals') return { data: exam }
    if (table === 'user_preferences') return { data: { daily_goal_default: storedGoal } }
    return { count: 3 }
  }))
  assert.deepEqual(await getDynamicDailyGoal(), { goal: 18, activeGoal: null })
  storedGoal = 200
  assert.deepEqual(await getDynamicDailyGoal(), { goal: 10, activeGoal: null })
  exam = { id: 'prova', exam_date: '2199-01-01' }
  calls.length = 0
  assert.deepEqual(await getDynamicDailyGoal(), { goal: 5, activeGoal: exam })
  assert.deepEqual(calls, ['exam_goals', 'flashcards'])
})

test('falha ao gerar o backup impede a exclusão e a confirmação precisa ser exata', async () => {
  const calls = []
  const { deleteAllUserData } = loadAction('settings', database((request) => {
    calls.push(request)
    return request.table === 'notes' ? { data: null, error: new Error('Fixture de leitura') } : { data: [], error: null }
  }))
  await assert.rejects(deleteAllUserData(DELETE_STUDY_DATA_CONFIRMATION + ' '), /Confirmação incorreta/)
  assert.equal(calls.length, 0)
  await assert.rejects(deleteAllUserData(DELETE_STUDY_DATA_CONFIRMATION), /Falha ao apagar dados/)
  assert.equal(calls.some(({ method }) => method === 'delete'), false)
})

test('erro devolvido pelo banco durante a exclusão interrompe os passos seguintes', async () => {
  const calls = []
  const { deleteAllUserData } = loadAction('settings', database((request) => {
    calls.push(request)
    const error = request.method === 'delete' && request.table === 'daily_study_logs' ? new Error('Fixture de exclusão') : null
    return { data: [{ id: 'workspace' }], error }
  }))
  await assert.rejects(deleteAllUserData(DELETE_STUDY_DATA_CONFIRMATION), /Falha ao apagar dados/)
  const deletes = calls.filter(({ method }) => method === 'delete')
  assert.equal(deletes.some(({ table }) => table === 'daily_study_logs'), true)
  assert.equal(deletes.some(({ table }) => table === 'workspaces'), false)
})

test('painel começa em Estudos com campo rotulado e exclusão desabilitada', () => {
  const { default: SettingsTabs } = load('src/components/settings/SettingsTabs.tsx', {
    '@/contexts/SettingsContext': { useSettings: () => ({ settings: DEFAULT_PREFERENCES, isUpdating: false }) },
    '@/actions/settings': {},
    '@/components/ReviewAlarm': () => null,
    '@/types/settings': preferences,
  })
  const html = renderToStaticMarkup(createElement(SettingsTabs))
  assert.match(html, /role="tab" id="settings-tab-estudos" aria-selected="true"/)
  assert.match(html, /for="settings-daily-goal">Meta diária padrão/)
  assert.match(html, /role="switch"[^>]*aria-describedby="settings-dnd-info"/)
  assert.match(html, /CONCORDO EM APAGAR TUDO/)
  assert.match(html, /<button type="submit" class="st-button st-danger" disabled="">Apagar dados/)
})
