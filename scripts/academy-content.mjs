import { createHash } from 'node:crypto'
import { readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import Ajv from 'ajv'

const base = new URL('../', import.meta.url)
const schema = JSON.parse(await readFile(new URL('content/academy/package.schema.json', base), 'utf8'))
const validate = new Ajv({ allErrors: true }).compile(schema)

function unique(items, label) {
  const ids = new Map()
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`${label}: ID duplicado ${item.id}`)
    ids.set(item.id, item)
  }
  return ids
}

function relationGraph(items, label) {
  const checked = new Set()
  const checking = new Set()
  function visit(id) {
    if (checked.has(id)) return
    if (checking.has(id)) throw new Error(`${label}: ciclo em ${id}`)
    const item = items.get(id)
    if (!item) throw new Error(`${label}: pré-requisito inexistente ${id}`)
    checking.add(id)
    item.prerequisites.forEach(visit)
    checking.delete(id)
    checked.add(id)
  }
  items.forEach(({ id }) => visit(id))
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
  }
  return value
}

function sameIds(expected, actual, label) {
  const wanted = new Set(expected)
  if (actual.length !== wanted.size || new Set(actual).size !== wanted.size || actual.some((id) => !wanted.has(id))) {
    throw new Error(`${label}: os IDs da resposta precisam corresponder aos itens apresentados`)
  }
}

export function projectAssessment(exercise) {
  const { kind, phase, explanation, ...publicFields } = exercise
  const shown = { kind, phase, ...publicFields }
  const grading = { kind, phase, explanation }
  function protect(key) {
    grading[key] = shown[key]
    delete shown[key]
  }

  switch (kind) {
    case 'text':
    case 'output':
      if (kind === 'text' && exercise.accepted.some((answer) => !answer.trim())) {
        throw new Error(`Resposta vazia em ${exercise.id}`)
      }
      protect('accepted')
      break
    case 'multiple-choice':
      if (!unique(exercise.options, exercise.id).has(exercise.correctOptionId)) {
        throw new Error(`Alternativa correta inexistente em ${exercise.id}`)
      }
      protect('correctOptionId')
      break
    case 'ordering':
      sameIds(unique(exercise.items, exercise.id).keys(), exercise.correctOrder, exercise.id)
      protect('correctOrder')
      break
    case 'parsons':
      sameIds(unique(exercise.lines, exercise.id).keys(), exercise.correctLines.map(({ id }) => id), exercise.id)
      if (exercise.lines.some(({ label }) => /[\r\n]|^\s/.test(label)) ||
        exercise.correctLines.some(({ indent }) => indent > exercise.maxIndent)) {
        throw new Error(`Use uma linha sem recuo e respeite maxIndent em ${exercise.id}`)
      }
      protect('correctLines')
      break
    case 'matching':
      sameIds(unique(exercise.left, exercise.id).keys(), Object.keys(exercise.pairs), exercise.id)
      sameIds(unique(exercise.right, exercise.id).keys(), Object.values(exercise.pairs), exercise.id)
      protect('pairs')
      break
    case 'trace':
    case 'fill-in':
      sameIds(unique(exercise.fields, exercise.id).keys(), Object.keys(exercise.acceptedByField), exercise.id)
      if (Object.values(exercise.acceptedByField).flat().some((answer) => !answer.trim())) {
        throw new Error(`Resposta vazia em ${exercise.id}`)
      }
      protect('acceptedByField')
      break
  }
  return { shown, grading }
}

export async function prepareContent(content, { checkFiles = true } = {}) {
  if (!validate(content)) {
    throw new Error(validate.errors.map(({ instancePath, message }) => `${instancePath || '/'} ${message}`).join('\n'))
  }
  const competencies = unique(content.competencies, 'Competências')
  const resources = unique(content.resources, 'Recursos')
  const formations = unique(content.formations, 'Formações')
  unique(content.market.sources, 'Fontes')
  unique(content.market.vacancies, 'Vagas')
  const lessons = unique(content.formations.flatMap((f) => f.chapters.flatMap((c) => c.lessons)), 'Aulas')
  relationGraph(competencies, 'Competências')
  relationGraph(lessons, 'Aulas')

  function needResource(id, kind) {
    if (resources.get(id)?.type !== kind) throw new Error(`Recurso ${id} precisa existir como ${kind}`)
  }
  for (const resource of resources.values()) {
    const isImage = /\.(png|jpg|webp)$/.test(resource.path)
    if (isImage !== (resource.type === 'image') || (isImage && (!resource.width || !resource.height))) {
      throw new Error(`Formato ou dimensões incompatíveis em ${resource.id}`)
    }
    if (checkFiles) {
      const file = new URL('public' + resource.path, base)
      const entry = await stat(file)
      if (!entry.isFile() || entry.size < 12 || entry.size > 2 * 1024 * 1024) throw new Error(`Arquivo inválido em ${resource.id}`)
      const data = await readFile(file)
      const head = data.subarray(0, 12).toString('latin1')
      const signature = { webp: /^RIFF....WEBP/s, png: /^\x89PNG/, jpg: /^\xff\xd8\xff/, mp3: /^(?:ID3|\xff[\xe0-\xff])/, wav: /^RIFF....WAVE/s, ogg: /^OggS/ }
      if (!signature[resource.path.split('.').at(-1)].test(head)) throw new Error(`Arquivo com assinatura incompatível em ${resource.id}`)
    }
  }
  const sourceUrls = new Set()
  for (const vacancy of content.market.vacancies) {
    const url = new URL(vacancy.sourceUrl)
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`Origem inválida em ${vacancy.id}`)
    url.hash = ''
    if (sourceUrls.has(url.href)) throw new Error(`URL de vaga duplicada em ${vacancy.id}`)
    sourceUrls.add(url.href)
    if (vacancy.requirements.some((id) => !competencies.has(id))) throw new Error(`Competência desconhecida em ${vacancy.id}`)
  }
  for (const formation of formations.values()) {
    needResource(formation.art, 'image')
    unique(formation.chapters, formation.id)
  }

  const keys = {}
  const projected = []
  for (const lesson of lessons.values()) {
    if (!lesson.competencies.every((id) => competencies.has(id))) throw new Error(`Competência desconhecida em ${lesson.id}`)
    if (!lesson.resources.every((id) => resources.has(id))) throw new Error(`Recurso desconhecido em ${lesson.id}`)
    for (const phrase of [...(lesson.dialogue ?? []), ...(lesson.vocabulary ?? [])]) {
      if (phrase.audio) needResource(phrase.audio, 'audio')
    }
    if (lesson.visual && (lesson.visual.start > lesson.visual.end || lesson.visual.end - lesson.visual.start > 20)) {
      throw new Error(`Intervalo visual inválido em ${lesson.id}`)
    }
    unique(lesson.exercises, lesson.id)
    if (lesson.progressFromVersion !== undefined && lesson.progressFromVersion >= content.version) {
      throw new Error(`A origem do progresso precisa ser anterior à versão do pacote: ${lesson.id}`)
    }
    if (!lesson.exercises.some((exercise) => 'phase' in exercise && exercise.phase !== 'review')) {
      throw new Error(`Aula ${lesson.id} precisa de prática corrigível no servidor`)
    }
    if (lesson.exercises.filter((exercise) => exercise.phase === 'review').length !== 1) {
      throw new Error(`Aula ${lesson.id} precisa de uma atividade programada de revisão`)
    }
    if (content.schemaVersion === 1 && lesson.exercises.filter((exercise) => exercise.kind === 'python').length > 1) {
      throw new Error(`Use schemaVersion 2 para múltiplos desafios Python: ${lesson.id}`)
    }
    const exercises = lesson.exercises.map((exercise) => {
      if (exercise.resource && !resources.has(exercise.resource)) throw new Error(`Recurso desconhecido em ${exercise.id}`)
      const key = lesson.id + '/' + exercise.id
      // Keep the v1 projection byte-compatible with the existing pilot seed.
      if (content.schemaVersion === 1 && exercise.kind === 'text') {
        const { accepted, explanation, ...shown } = exercise
        if (accepted.some((answer) => !answer.trim())) throw new Error(`Resposta vazia em ${exercise.id}`)
        keys[key] = { kind: exercise.kind, phase: exercise.phase, accepted, explanation }
        return shown
      }
      if (exercise.kind === 'python') {
        const { solution, hiddenCases, ...shown } = exercise
        unique([...shown.publicCases, ...hiddenCases], exercise.id)
        keys[key] = { kind: exercise.kind, solution, hiddenCases }
        return shown
      }
      if ('phase' in exercise) {
        const { shown, grading } = projectAssessment(exercise)
        keys[key] = grading
        return shown
      }
      return exercise
    })
    projected.push({ ...lesson, exercises })
  }
  return {
    id: content.id, version: content.version, schemaVersion: content.schemaVersion,
    digest: createHash('sha256').update(JSON.stringify(canonical(content))).digest('hex'),
    catalog: {
      ...(content.schemaVersion === 2 ? { schemaVersion: 2 } : {}),
      description: content.description, pilot: content.pilot, market: content.market,
      competencies: content.competencies, resources: content.resources,
      formations: content.formations.map((formation) => ({
        ...formation, chapters: formation.chapters.map((chapter) => ({
          ...chapter, lessons: chapter.lessons.map(({ id, title, summary, minutes, prerequisites, competencies }) =>
            ({ id, title, summary, minutes, prerequisites, competencies })),
        })),
      })),
    },
    lessons: projected, keys,
  }
}

function quote(value) { return "'" + value.replaceAll("'", "''") + "'" }

export function toImportSql({ id, version, schemaVersion, digest, catalog, lessons, keys }) {
  const json = (value) => quote(JSON.stringify(value)) + '::jsonb'
  const importer = schemaVersion === 2 ? 'academy_import_release_v2' : 'academy_import_release'
  return `-- Gerado por scripts/academy-content.mjs. Pode conter material privado.\nBEGIN;\nSET LOCAL standard_conforming_strings = on;\nSELECT public.${importer}(\n  ${quote(id)}, ${version}, ${quote(digest)},\n  ${json(catalog)},\n  ${json(lessons)},\n  ${json(keys)}\n);\nCOMMIT;\n`
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [, , input, option, output] = process.argv
    if (!input || !['--check', '--out'].includes(option) || (option === '--out' && !output)) {
      throw new Error('Uso: node scripts/academy-content.mjs pacote.json --check | --out caminho.sql')
    }
    if ((await stat(input)).size > 8 * 1024 * 1024) throw new Error('Pacote JSON excede 8 MB')
    const release = await prepareContent(JSON.parse(await readFile(input, 'utf8')))
    if (option === '--out') {
      const outputPath = resolve(output)
      const target = resolve(await realpath(dirname(outputPath)), basename(outputPath))
      const inside = relative(await realpath(fileURLToPath(base)), target)
      const outside = isAbsolute(inside) || inside === '..' || inside.startsWith('..' + sep)
      const approvedExample = release.id === 'academy-pilot' && release.catalog.pilot &&
        inside === ['supabase', 'migrations', '20261126000001_academy_pilot.sql'].join(sep)
      if (!target.endsWith('.sql') || (!outside && !approvedExample)) throw new Error('Escolha um arquivo .sql fora do repositório')
      await writeFile(target, toImportSql(release), { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    }
    console.log(`${release.id} v${release.version}: ${release.lessons.length} aulas validadas`)
  } catch (error) {
    // Erros de parse podem conter trechos do arquivo. Mostre somente o tipo.
    console.error(error instanceof SyntaxError ? 'JSON inválido' : error.message)
    process.exitCode = 1
  }
}
