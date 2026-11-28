import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createUiRequire } from '../helpers/icon-imports.mjs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const require = createUiRequire(import.meta.url)
const render = (component, props) => renderToStaticMarkup(createElement(component, props))

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
    if (name === 'next/image') return function ImageFixture({ src, alt, width, height, className }) {
      return createElement('img', { src, alt, width, height, className })
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

const avatars = load('src/utils/avatars.ts')
const achievements = load('src/types/achievements.ts')
const profile = load('src/lib/profile.ts')
const { default: AvatarFace } = load('src/components/AvatarFace.tsx', { '@/utils/avatars': avatars })
const { default: ProfilePanel } = load('src/components/ProfilePanel.tsx', {
  'next/navigation': { useRouter: () => ({}) },
  '@/actions/achievements': {},
  '@/components/AvatarFace': AvatarFace,
  '@/lib/profile': profile,
  '@/types/achievements': achievements,
  '@/utils/avatars': avatars,
})

test('atividade semanal usa sete datas de calendário e preenche dias sem revisão com zero', () => {
  const days = profile.profileWeek([
    { study_date: '2026-11-15', review_count: 12 },
    { study_date: '2026-11-16', review_count: 4 },
    { study_date: '2026-11-21', review_count: 1 },
    { study_date: '2026-11-22T13:00:00Z', review_count: 5 },
  ], new Date('2026-11-22T03:10:00Z'))
  assert.deepEqual(days.map((day) => day.reviews), [4, 0, 0, 0, 0, 1, 5])
  assert.equal(days[0].date, '2026-11-16')
  assert.equal(days[6].date, '2026-11-22')
  assert.match(days[6].label, /22 de novembro de 2026/)
})

test('barra de nível desconta XP dos níveis anteriores e limita o progresso à faixa atual', () => {
  assert.deepEqual(profile.profileLevelProgress(3, 38), { value: 18, target: 25 })
  assert.deepEqual(profile.profileLevelProgress(3, 2), { value: 0, target: 25 })
  assert.deepEqual(profile.profileLevelProgress(3, 48), { value: 25, target: 25 })
})

test('ícone escolhido tem prioridade sobre foto existente, com foto e iniciais como alternativas', () => {
  const data = { name: '  Ana  Costa ', avatarUrl: '/foto.png', size: 44 }
  assert.match(render(AvatarFace, { ...data, avatarIcon: 'Rocket' }), /<svg/)
  assert.doesNotMatch(render(AvatarFace, { ...data, avatarIcon: 'Rocket' }), /foto\.png/)
  assert.match(render(AvatarFace, { ...data, avatarIcon: '__proto__' }), /src="\/foto\.png"/)
  assert.match(render(AvatarFace, { ...data, avatarUrl: null }), />AC<\/span>/)
})

test('perfil apresenta contagens reais, datas com zero, seleção de avatar e link da galeria', () => {
  const markup = render(ProfilePanel, {
    initialData: {
      user: { name: 'Ana Costa', avatarUrl: null, avatarIcon: 'Rocket', playerTitle: 'Exploradora de Dados' },
      totalXp: 38,
      currentLevel: 3,
      streakShields: 1,
      streak: 2,
      maxStreak: 5,
      cardsReviewed: 12,
      notesCreated: 4,
      perfectExams: 0,
      unlockedAchievements: ['o_inicio', 'o_inicio', 'legado'],
      recentActivity: profile.profileWeek([], new Date('2026-11-22T03:10:00Z')),
    },
  })
  assert.match(markup, /Progresso para o nível 4/)
  assert.match(markup, /value="18" max="25"/)
  assert.match(markup, /href="\/dashboard\/conquistas"/)
  assert.match(markup, /1 de 17 desbloqueadas/)
  assert.match(markup, /As próximas revisões aparecerão neste gráfico/)
  assert.equal((markup.match(/height:0%/g) ?? []).length, 7)
  assert.match(markup, /<dialog[^>]*aria-labelledby="avatar-modal-title"/)
  assert.match(markup, /aria-pressed="true"[^>]*>.*?<span>Foguete<\/span>/)
})
