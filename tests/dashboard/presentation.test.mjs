import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createUiRequire } from '../helpers/icon-imports.mjs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const require = createUiRequire(import.meta.url)
const modules = new Map()

function load(name) {
  if (modules.has(name)) return modules.get(name)
  const path = name.startsWith('lib/') ? '../' + name + '.ts' : name + '.tsx'
  const source = readFileSync(new URL('../../src/components/' + path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    },
  })
  const loadDependency = (moduleName) => {
    if (moduleName === 'next/link') return function LinkFixture({ children, ...props }) {
      delete props.prefetch
      return createElement('a', props, children)
    }
    if (moduleName === 'next/image') return function ImageFixture({ src, alt, width, height, className }) {
      return createElement('img', { src, alt, width, height, className })
    }
    if (moduleName === '@/components/StudyCompanion' || moduleName === '@/components/AvatarFace') return () => null
    if (moduleName === '@/components/DashboardAssistantTeaser') return load('DashboardAssistantTeaser').default
    if (moduleName === '@/components/ThemeToggle') return { SavedThemeToggle: () => null }
    if (moduleName === '@/components/academy/AcademyNavigation') return load('academy/AcademyNavigation')
    if (moduleName === '@/lib/academy/contracts') return { academyPath: '/dashboard/academy' }
    if (moduleName === '@/lib/academy/practice') return { practicePath: '/dashboard/academy/praticas' }
    if (moduleName === '@/lib/academy/presentation') return { journeyPath: '/dashboard/academy/jornada', skillsPath: '/dashboard/academy/competencias' }
    if (moduleName === '@/actions/workspaces') return { signOut: async () => {} }
    if (moduleName === 'next/navigation') return { usePathname: () => '/dashboard/questoes/historico', useRouter: () => ({}), useSearchParams: () => new URLSearchParams() }
    if (moduleName.startsWith('@/lib/')) return load(moduleName.slice(2))
    return require(moduleName)
  }
  const state = { exports: {} }
  new Function('module', 'exports', 'require', outputText)(state, state.exports, loadDependency)
  modules.set(name, state.exports)
  return state.exports
}

const render = (component, props) => renderToStaticMarkup(createElement(component, props))

test('fila de revisões em dia é independente da meta diária', () => {
  const { DashboardReviewFocus } = load('DashboardOverview')
  const { default: Progress } = load('DailyProgressCircle')
  const focus = render(DashboardReviewFocus, { overdueCards: 0, totalCards: 12 })
  const goal = render(Progress, { reviewCount: 0, dailyGoal: 10, multiplier: 1 })
  assert.match(focus, /Sem cards pendentes/)
  assert.match(focus, /href="\/dashboard\/revisoes"/)
  assert.match(goal, /Faltam 10 revisões/)
  assert.match(goal, /aria-valuenow="0"/)
  assert.doesNotMatch(focus + goal, /Meta (cumprida|concluída)/)
})

test('pendências, progresso e calendário refletem os dados fornecidos', () => {
  const { DashboardReviewFocus } = load('DashboardOverview')
  const { default: Progress } = load('DailyProgressCircle')
  const focus = render(DashboardReviewFocus, { overdueCards: 4, totalCards: 9 })
  const goal = render(Progress, { reviewCount: 12, dailyGoal: 10, multiplier: 1.2, activeGoalTitle: 'Prova de TI' })
  assert.match(focus, /4 cards pendentes/)
  assert.match(focus, /Sessão estimada em 3 min/)
  assert.match(goal, /aria-valuenow="10" aria-valuetext="12 de 10 revisões"/)
  assert.match(goal, /Meta concluída/)
  assert.match(goal, /href="\/dashboard\/calendario"/)
})

test('Workspaces começa recolhido e o menu mantém perfil, calendário, configurações e Ultimato', () => {
  const { default: Sidebar } = load('Sidebar')
  const html = render(Sidebar, {
    workspaces: [{ id: 'sql', name: 'SQL', description: null }],
    userName: 'Estudante', avatarUrl: null, drawerOpen: false, collapsed: false,
  })
  assert.match(html, /aria-expanded="false" aria-controls="os-workspaces-list"/)
  assert.match(html, /id="os-workspaces-list" hidden=""/)
  assert.match(html, /href="\/dashboard\/revisoes\?mode=ultimato"/)
  for (const route of ['perfil', 'calendario', 'configuracoes']) {
    assert.ok(html.includes('href="/dashboard/' + route + '"'))
  }
  assert.match(html, /href="\/dashboard\/questoes" aria-current="page"/)
  assert.doesNotMatch(html, /href="\/dashboard\/(assistente|feynman|grafo)"/)
})

test('navegação mobile e banner apontam para as rotas existentes', () => {
  const { MobileDock } = load('MobileTopbar')
  const { DashboardHero } = load('DashboardOverview')
  const nav = render(MobileDock, { menuOpen: false })
  const hero = render(DashboardHero, { greeting: 'Boa tarde', date: '23 de novembro' })
  assert.match(nav, /aria-label="Abrir Assistente"/)
  assert.match(nav, /aria-controls="dashboard-sidebar"/)
  assert.match(nav, /href="\/dashboard\/revisoes"/)
  assert.match(hero, /href="\/dashboard\/calendario"/)
  assert.match(hero, /brain\.webp/)
})

test('ritmo semanal mostra proporções e dias ativos a partir dos registros', () => {
  const { profileWeek } = load('lib/profile')
  const { default: Rhythm } = load('DashboardStudyRhythm')
  const days = profileWeek([{ study_date: '2026-11-23', review_count: 4 }], new Date('2026-11-23T18:00:00Z'))
  const chart = render(Rhythm, { days })
  assert.match(chart, /1 \/ 7/)
  assert.match(chart, /4 revisões/)
  assert.equal((chart.match(/height:0%/g) ?? []).length, 6)
})

test('uma meta aumentada no mesmo dia reflete as revisões que ainda faltam', () => {
  const { default: Progress } = load('DailyProgressCircle')
  const goal = render(Progress, { reviewCount: 10, dailyGoal: 25, multiplier: 1 })
  assert.match(goal, /Faltam 15 revisões/)
  assert.match(goal, /aria-valuemax="25" aria-valuenow="10"/)
  assert.doesNotMatch(goal, /Meta concluída/)
})

test('conta nova recebe instruções de estudo e workspaces sem revisão não mostram 100% de retenção', () => {
  const { DashboardEmptyActivity, DashboardReviewFocus } = load('DashboardOverview')
  const { default: Workspaces } = load('WorkspaceHealthGrid')
  const workspace = { id: 'sql', name: 'SQL', score: 100, status: 'green', totalCards: 2, reviewedCards: 0 }
  const workspaceMarkup = render(Workspaces, { healths: [workspace] })
  assert.match(render(DashboardReviewFocus, { overdueCards: 0, totalCards: 0 }), /Prepare sua primeira revisão/)
  assert.match(render(DashboardEmptyActivity, { showOnboarding: true }), /Crie um workspace/)
  assert.doesNotMatch(render(DashboardEmptyActivity, { showOnboarding: false }), /Crie um workspace/)
  assert.match(workspaceMarkup, /Sem revisões/)
  assert.match(workspaceMarkup, /href="\/dashboard\/sql"/)
  assert.doesNotMatch(workspaceMarkup, /100%|<progress/)
})

test('mapa representa 140 datas e usa a contagem registrada em cada dia', () => {
  const { default: Heatmap } = load('Heatmap')
  const html = render(Heatmap, {
    today: '2026-11-20',
    logs: [{ study_date: '2026-11-19T23:50:00Z', review_count: 4 }],
  })
  assert.equal((html.match(/class="dh-heat-cell /g) ?? []).length, 140)
  assert.match(html, /aria-label="19\/11\/2026 · 4 revisões"/)
  assert.match(html, /aria-label="20\/11\/2026 · 0 revisões"[^>]*tabindex="0"/)
})
