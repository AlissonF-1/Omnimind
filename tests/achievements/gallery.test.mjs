import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const require = createRequire(import.meta.url)

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
    if (name === 'next/image') return function ImageFixture({ src, alt }) {
      return createElement('img', { src, alt })
    }
    if (name === 'next/link') return function LinkFixture(props) {
      return createElement('a', props)
    }
    return require(name)
  }
  const state = { exports: {} }
  new Function('module', 'exports', 'require', outputText)(state, state.exports, dependencies)
  return state.exports
}

const definitions = load('src/types/achievements.ts')
const { buildCollection } = load('src/app/dashboard/conquistas/collection.ts', { '@/types/achievements': definitions })
const { default: Panel } = load('src/components/AchievementsPanel.tsx', { '@/utils/audio': { playTrophySound: () => {} } })
const counters = { reviews: 1, streak: 2, exams: 0, notes: 8, tutor: 4, simulations: 0 }

test('a coleção inclui os troféus cadastrados e ordena os níveis de cada família', () => {
  const gallery = buildCollection(['o_inicio', 'o_inicio', 'legado_inexistente'], counters)
  assert.equal(gallery.total, Object.keys(definitions.ACHIEVEMENTS).length)
  assert.equal(gallery.unlockedCount, 1)
  const family = gallery.families.find((item) => item.id === 'notas')
  assert.deepEqual(family.items.map((item) => item.tier), ['bronze', 'prata', 'ouro', 'diamante'])
  assert.deepEqual(family.items.map((item) => item.progress.target), [10, 50, 100, 500])
})

test('a próxima meta apresenta progresso conhecido e prioriza o próximo nível de cada família', () => {
  const gallery = buildCollection(['o_inicio', 'o_tutor_bronze'], { ...counters, tutor: 5, simulations: 49 })
  assert.equal(gallery.next.item.id, 'o_arquivista_bronze')
  assert.equal(gallery.next.remainingLabel, 'Faltam 2 notas.')
  const streak = buildCollection(['o_inicio'], { ...counters, notes: null, tutor: null, streak: 6 })
  assert.equal(streak.next.item.id, 'a_chama')
  assert.equal(streak.next.remainingLabel, 'Falta 1 dia seguido.')
})

test('a vitrine bloqueada mostra uma pista e a versão desbloqueada mostra a arte e o critério', () => {
  const locked = buildCollection([], counters)
  assert.doesNotMatch(JSON.stringify(locked), /premio_nobel|nobel_3d|Prêmio Nobel/)
  const lockedHtml = renderToStaticMarkup(createElement(Panel, { collection: locked, workspaceId: 'sql' }))
  assert.match(lockedHtml, /Troféu secreto/)
  assert.match(lockedHtml, /href="\/dashboard\/feynman"/)
  assert.match(lockedHtml, /3 conquistas secretas/)
  assert.doesNotMatch(lockedHtml, /nobel_3d|Prêmio Nobel/)

  const unlocked = buildCollection(['premio_nobel'], counters)
  const unlockedHtml = renderToStaticMarkup(createElement(Panel, { collection: unlocked }))
  assert.match(unlockedHtml, /Prêmio Nobel/)
  assert.match(unlockedHtml, /Tirou 9 de 10 ou mais/)
  assert.match(unlockedHtml, /src="\/images\/nobel_3d\.png"/)
  assert.equal(unlocked.unlockedCount, 1)
})

test('a Crônica filtra marcos de calendário e de revisão pelos tipos persistidos', async () => {
  const calls = []
  const query = {
    select: () => query,
    eq: (field, value) => { calls.push([field, value]); return query },
    order: () => query,
    in: (field, values) => { calls.push([field, values]); return query },
    then: (resolve) => resolve({ data: [] }),
  }
  const { getMilestones } = load('src/actions/milestones.ts', {
    'next/cache': {},
    '@/utils/supabase/server': {
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'estudante' } } }) }, from: () => query }),
    },
  })
  await getMilestones('exam')
  await getMilestones('review')
  assert.deepEqual(calls, [
    ['user_id', 'estudante'], ['type', ['exam', 'exam_created']],
    ['user_id', 'estudante'], ['type', ['review', 'perfect_review', 'session_complete']],
  ])
})
