import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { prepareContent } from '../../scripts/academy-content.mjs'
import { academyLessonMediaIds, fetchAcademyProgress } from '../../src/lib/academy/catalog-queries.ts'

const pilot = JSON.parse(await readFile(new URL('../../content/academy/pilot.example.json', import.meta.url), 'utf8'))
const example = JSON.parse(await readFile(new URL('../../content/academy/v2.example.json', import.meta.url), 'utf8'))
const lessonId = (number) => `fixture-lesson-${String(number).padStart(4, '0')}`

function fillMedia(content, count) {
  const original = content.resources[0]
  while (content.resources.length < count) {
    const id = `fixture-media-${content.resources.length}`
    content.resources.push({ ...original, id, path: `/academy/media/${id}.webp` })
  }
  return content
}

test('contrato v2 prepara 240 aulas e 512 recursos; v1 conserva seu limite de 200', async (t) => {
  const fixture = fillMedia(structuredClone(example), 512)
  const template = pilot.formations[0].chapters[0].lessons[0]
  fixture.formations = fixture.formations.map((formation, index) => ({
    ...formation,
    chapters: Array.from({ length: 3 }, (_, chapter) => ({
      id: `fixture-${index}-${chapter}`, title: 'Capítulo de teste',
      lessons: Array.from({ length: 40 }, (_, item) => {
        const position = index * 120 + chapter * 40 + item
        const id = lessonId(position)
        return { ...template, id, resources: [fixture.resources.at(-1).id],
          prerequisites: position % 120 ? [lessonId(position - 1)] : [] }
      }),
    })),
  }))
  const result = await prepareContent(fixture, { checkFiles: false })
  assert.equal(result.lessons.length, 240)
  assert.equal(result.catalog.resources.length, 512)
  const { resources, ...summary } = result.catalog
  const bytes = (value) => Buffer.byteLength(JSON.stringify(value))
  t.diagnostic(`Fixture: catálogo ${bytes(result.catalog)} bytes; sem índice de mídia ${bytes(summary)} bytes`)
  assert.ok(bytes(summary) < bytes(result.catalog) / 2)
  assert.equal(resources.filter(({ id }) => academyLessonMediaIds(result.lessons[0]).has(id)).length, 1)
  await assert.rejects(prepareContent(fillMedia(fixture, 513), { checkFiles: false }), /\/resources must NOT have more than 512 items/)
  await prepareContent(fillMedia(structuredClone(pilot), 200), { checkFiles: false })
  await assert.rejects(prepareContent(fillMedia(structuredClone(pilot), 201), { checkFiles: false }), /\/resources must NOT have more than 200 items/)
})

test('busca paginada recupera mais de mil progressos sem duplicar ou perder a última aula', async () => {
  const progress = Array.from({ length: 1201 }, (_, index) => ({ lesson_id: lessonId(index) }))
  const cursors = []
  const actual = await fetchAcademyProgress(async (after, limit) => {
    cursors.push(after)
    return progress.filter(({ lesson_id }) => after === undefined || lesson_id > after).slice(0, limit)
  })
  assert.deepEqual(actual, progress)
  assert.deepEqual(cursors, [undefined, 199, 399, 599, 799, 999, 1199].map((index) => index === undefined ? index : lessonId(index)))
})

test('recursos da aula incluem exercício, diálogo e vocabulário sem repetir arquivos', () => {
  const lesson = {
    resources: ['cover'], exercises: [{ resource: 'clip' }, {}],
    dialogue: [{ audio: 'dialogue' }], vocabulary: [{ audio: 'word' }, { audio: 'clip' }],
  }
  assert.deepEqual([...academyLessonMediaIds(lesson)], ['cover', 'clip', 'dialogue', 'word'])
})
