import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { prepareContent, toImportSql } from '../../scripts/academy-content.mjs'
import {
  availableLesson,
  buildAcademyDashboardState,
  nextAcademyLesson,
  partitionAcademyReleases,
  progressByLesson,
} from '../../src/lib/academy/contracts.ts'

const pilot = JSON.parse(await readFile(new URL('../../content/academy/pilot.example.json', import.meta.url), 'utf8'))
const migration = new URL('../../supabase/migrations/20261126000001_academy_pilot.sql', import.meta.url)

test('piloto válido com duas aulas por formação e mídia local', async () => {
  const release = await prepareContent(pilot)
  assert.deepEqual(release.catalog.formations.map(({ chapters }) => chapters.flatMap((chapter) => chapter.lessons).length), [2, 2])
  assert.equal(release.lessons.filter((lesson) => lesson.dialogue?.length).length, 2)
  assert.equal(release.lessons.filter((lesson) => lesson.visual).length, 2)
  assert.equal(release.lessons.filter((lesson) => lesson.exercises.some(({ kind }) => kind === 'python')).length, 2)
  assert.equal((await readFile(migration, 'utf8')).replaceAll('\r\n', '\n'), toImportSql(release))
})

test('projeção do aluno exclui gabaritos, soluções, explicações de correção e testes privados', async () => {
  const { lessons, catalog, keys } = await prepareContent(pilot, { checkFiles: false })
  const shown = JSON.stringify({ lessons, catalog })
  for (const property of ['accepted', 'solution', 'hiddenCases', 'explanation', 'lessonMarkdown']) {
    assert.equal(JSON.stringify(catalog).includes(`"${property}":`), false)
    if (property !== 'lessonMarkdown') assert.equal(shown.includes(`"${property}":`), false)
  }
  assert.equal(keys['decisoes-em-python/liberar-pedido'].hiddenCases.length, 1)
})

test('identidade do pacote é canônica e muda com alteração material ou versão', async () => {
  const original = await prepareContent(pilot, { checkFiles: false })
  const reordered = Object.fromEntries(Object.entries(pilot).reverse())
  assert.equal((await prepareContent(reordered, { checkFiles: false })).digest, original.digest)
  const changed = { ...pilot, version: 2 }
  assert.notEqual((await prepareContent(changed, { checkFiles: false })).digest, original.digest)
})

test('importador impede duplicação, ciclo, vínculo inválido e mídia externa', async () => {
  const duplicate = structuredClone(pilot)
  duplicate.formations[0].chapters[0].lessons.push(duplicate.formations[0].chapters[0].lessons[0])
  await assert.rejects(prepareContent(duplicate, { checkFiles: false }), /duplicado/)
  const cyclic = structuredClone(pilot)
  cyclic.formations[0].chapters[0].lessons[0].prerequisites = ['decisoes-em-python']
  await assert.rejects(prepareContent(cyclic, { checkFiles: false }), /ciclo/)
  const broken = structuredClone(pilot)
  broken.formations[0].chapters[0].lessons[0].competencies = ['sem-cadastro']
  await assert.rejects(prepareContent(broken, { checkFiles: false }), /Competência desconhecida/)
  const external = structuredClone(pilot)
  external.resources[0].path = 'https://example.test/image.webp'
  await assert.rejects(prepareContent(external, { checkFiles: false }), /pattern/)
  const invalidReview = structuredClone(pilot)
  invalidReview.formations[0].chapters[0].lessons[0].exercises.pop()
  await assert.rejects(prepareContent(invalidReview, { checkFiles: false }), /programada de revisão/)
})

test('retomada considera a versão correta, bloqueia pré-requisitos e prioriza progresso iniciado', () => {
  const release = { id: pilot.id, version: pilot.version }
  const lessons = pilot.formations[0].chapters.flatMap((chapter) => chapter.lessons)
  const [first, second] = lessons
  const rows = [
    { release_id: release.id, version: 0, lesson_id: first.id, last_activity: '2026-11-24', completed_at: '2026-11-24' },
    { release_id: release.id, version: 1, lesson_id: first.id, last_activity: '2026-11-25', completed_at: null },
  ]
  assert.equal(availableLesson(second, new Set()), false)
  assert.equal(nextAcademyLesson(lessons, progressByLesson(release, rows)).id, first.id)
  rows[1].completed_at = '2026-11-25'
  assert.equal(nextAcademyLesson(lessons, progressByLesson(release, rows)).id, second.id)
})

function makeRegularRelease() {
  const techLessons = Array.from({ length: 5 }, (_, index) => ({
    id: `tech-0${index + 1}`,
    title: `Tech ${index + 1}`,
    summary: `Resumo tech ${index + 1}`,
    minutes: 50,
    prerequisites: index === 0 ? [] : [`tech-0${index}`],
    competencies: ['comp-tech'],
  }))
  const englishLessons = Array.from({ length: 5 }, (_, index) => ({
    id: `english-0${index + 1}`,
    title: `English ${index + 1}`,
    summary: `Resumo english ${index + 1}`,
    minutes: 45,
    prerequisites: index === 0 ? [] : [`english-0${index}`],
    competencies: ['comp-english'],
  }))
  return {
    id: 'omni-content-001',
    version: 1,
    catalog: {
      description: 'Lote 01 definitivo',
      pilot: false,
      formations: [
        {
          id: 'omni-tech-fundamentos',
          kind: 'tech',
          title: 'OmniMind Tech — Fundamentos',
          description: 'Tech',
          art: 'coding',
          chapters: [{ id: 'tech-fundamentos-01', title: 'Primeiros passos', lessons: techLessons }],
        },
        {
          id: 'omni-english-fundamentos',
          kind: 'english',
          title: 'OmniMind English — Pré-A1',
          description: 'English',
          art: 'english',
          chapters: [{ id: 'english-fundamentos-01', title: 'Primeiros contatos', lessons: englishLessons }],
        },
      ],
      resources: pilot.resources,
      competencies: [],
      market: { description: 'Mercado definitivo', sources: [], vacancies: [] },
    },
  }
}

test('consolidação oculta piloto da jornada regular, inicia com 10 aulas e preserva histórico sem transferir evidência', () => {
  const pilotRelease = {
    id: pilot.id,
    version: pilot.version,
    catalog: {
      description: pilot.description,
      pilot: pilot.pilot,
      formations: pilot.formations,
      resources: pilot.resources,
      competencies: pilot.competencies,
      market: pilot.market,
    },
  }
  const regularRelease = makeRegularRelease()

  const partitioned = partitionAcademyReleases([pilotRelease, regularRelease])
  assert.deepEqual(partitioned.active.map((r) => r.id), ['omni-content-001'])
  assert.deepEqual(partitioned.archived.map((r) => r.id), ['academy-pilot'])

  const newStudent = buildAcademyDashboardState([pilotRelease, regularRelease], [], Date.parse('2026-11-27T12:00:00Z'))
  assert.equal(newStudent.items.length, 2)
  assert.equal(newStudent.total, 10)
  assert.equal(newStudent.count, 0)
  assert.equal(newStudent.next?.release.id, 'omni-content-001')
  assert.equal(newStudent.next?.next?.id, 'tech-01')
  assert.equal(newStudent.market?.description, 'Mercado definitivo')
  assert.equal(newStudent.archivedHistory.length, 0)

  const pilotRows = [
    {
      release_id: 'academy-pilot',
      version: 1,
      lesson_id: 'variaveis-e-saida',
      completed_at: '2026-11-25T10:00:00Z',
      last_activity: '2026-11-25T10:00:00Z',
      review_due_at: '2026-11-26T10:00:00Z',
      review_count: 0,
    },
  ]
  const existingStudent = buildAcademyDashboardState([pilotRelease, regularRelease], pilotRows, Date.parse('2026-11-27T12:00:00Z'))
  assert.equal(existingStudent.total, 10)
  assert.equal(existingStudent.count, 0)
  assert.equal(existingStudent.due.length, 0)
  assert.equal(existingStudent.next?.release.id, 'omni-content-001')
  assert.equal(existingStudent.next?.next?.id, 'tech-01')
  assert.equal(existingStudent.archivedHistory.length, 1)
  assert.equal(existingStudent.archivedHistory[0].completedCount, 1)
  assert.equal(existingStudent.archivedHistory[0].totalCount, 4)

  const fallback = partitionAcademyReleases([pilotRelease])
  assert.deepEqual(fallback.active.map((r) => r.id), ['academy-pilot'])
  assert.deepEqual(fallback.archived, [])
})
