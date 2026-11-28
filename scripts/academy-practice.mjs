import { readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import Ajv2020 from 'ajv/dist/2020.js'
import { projectAssessment } from './academy-content.mjs'

const root = new URL('../', import.meta.url)
const optionLabels = (values) => values.map(({ id, text }) => ({ id, label: text }))
const inlineCode = (value) => value.replaceAll('\r\n', '\n').split('\n').map((line) => line ? '`' + line + '`' : '').join('\n')
const sortedUnique = (values) => [...new Set(values)].sort()
const itemPattern = /^(?:TECH|EN)-[A-Z0-9]+-[0-9]{4,6}$/
const lessonPattern = /^[a-z0-9][a-z0-9-]{0,63}\/[a-z0-9][a-z0-9-]{0,63}$/
const textSize = (value) => Buffer.byteLength(JSON.stringify(value))

async function readJson(path) {
  if ((await stat(path)).size > 8 * 1024 * 1024) throw new Error('Arquivo editorial excede 8 MiB: ' + basename(path))
  const content = (await readFile(path,'utf8')).replace(/^\uFEFF/,'')
  try { return JSON.parse(content) }
  catch { throw new Error('JSON editorial inválido: ' + basename(path)) }
}

function activityFor(question, mapping) {
  const { kind, id, explanation, hints } = question
  if (kind === 'open' || kind === 'debug') return null
  const prompt = [question.prompt]
  if (question.code) prompt.push(inlineCode(question.code))
  if (question.input) prompt.push('Entrada fornecida\n' + inlineCode(question.input))
  if (kind === 'python') prompt.push('Entrada\n' + question.inputFormat, 'Saída\n' + question.outputFormat, ...question.constraints)
  const base = { id: id.toLowerCase(), kind, prompt: prompt.join('\n\n'), hints }
  const editorial = Object.fromEntries(['checks','criteria','solution'].filter((key) => key in question).map((key) => [key, question[key]]))
  if (kind === 'python') {
    const cases = [...question.publicCases, ...question.hiddenCases]
    if (new Set(cases.map(({ id }) => id)).size !== cases.length || new Set(cases.map(({ input }) => input)).size !== cases.length) {
      throw new Error('Casos de teste duplicados em ' + id)
    }
    if ([question.starter,question.solution].some((code) => Buffer.byteLength(code)>12000)
        || cases.some(({input,expected}) => input.length>2000 || expected.length>4000)) throw new Error('Limite do laboratório em ' + id)
    return { activity: { ...base, starter: question.starter, publicCases: question.publicCases.map(({ id,input,expected }) => ({ id,input,expected })) },
      grading: { kind, ...editorial, hiddenCases: question.hiddenCases, explanation } }
  }
  const assessment = { ...base, phase: 'practice', explanation }
  let inputs
  switch (kind) {
    case 'multiple-choice': {
      const wrong = sortedUnique(question.options.map(({ id }) => id).filter((id) => id !== question.correctOptionId))
      if (JSON.stringify(wrong) !== JSON.stringify(Object.keys(question.distractors).sort())) throw new Error('Distratores incompletos em ' + id)
      inputs = { options: optionLabels(question.options), correctOptionId: question.correctOptionId }; break
    }
    case 'output':
    case 'text': inputs = { accepted: question.accepted }; break
    case 'trace':
    case 'fill-in':
      inputs = { fields: question.fields.map(({ id,label }) => ({ id,label })),
        acceptedByField: Object.fromEntries(question.fields.map(({ id,accepted }) => [id,accepted])) }
      if (question.fields.some(({ accepted }) => accepted.some((value) => value.length > (/[\r\n]/.test(value) ? 4000 : 300)))) {
        throw new Error('Resposta excede o campo disponível em ' + id)
      }
      break
    case 'ordering': inputs = { items: optionLabels(question.items), correctOrder: question.correctOrder }; break
    case 'parsons': inputs = { lines: optionLabels(question.lines), maxIndent: Math.max(0, ...question.correctLines.map(({ indent }) => indent)),
      correctLines: question.correctLines }; break
    case 'matching': inputs = { left: optionLabels(question.left), right: optionLabels(question.right), pairs: question.pairs }; break
    default: throw new Error('Formato desconhecido em ' + id)
  }
  const { shown: activity, grading } = projectAssessment({ ...assessment, ...inputs })
  if (kind === 'trace' || kind === 'fill-in') {
    const multiline = question.fields.filter(({ accepted }) => accepted.some((answer) => /[\r\n]/.test(answer))).map(({ id }) => id)
    if (multiline.length) {
      activity.multilineFields = multiline
      grading.multilineFields = multiline
    }
  }
  if (kind === 'multiple-choice') grading.distractors = question.distractors
  if (kind === 'matching' && question.criteria?.some((criterion) => /^Atribuir um terço da pontuação para cada associação correta\.$/i.test(criterion))) {
    if (question.left.length !== 3) throw new Error('Rubrica por terços exige três pares em ' + id)
    grading.partial = true
  }
  if (kind === 'ordering' && mapping?.equivalentOrders) {
    if (!Array.isArray(mapping.equivalentOrders) || mapping.equivalentOrders.length > 10) throw new Error('Equivalências inválidas em ' + id)
    grading.acceptedOrders = mapping.equivalentOrders.map((correctOrder) => {
      projectAssessment({ ...assessment, ...inputs, correctOrder })
      return correctOrder
    })
  }
  return { activity, grading: { ...grading, ...editorial } }
}

export function preparePractice(batches, validate, mapping = []) {
  if (!batches.length) throw new Error('Nenhuma bateria editorial encontrada')
  const context = new Map(mapping.map((entry) => [entry.editorialId,entry]))
  if (context.size !== mapping.length) throw new Error('Mapeamento com IDs duplicados')
  const skills = Object.create(null)
  const misconceptions = new Map()
  const questions = new Set()
  const batchIds = new Set()
  const fingerprints = new Map()
  const items = []
  const report = []
  for (const batch of batches) {
    if (!validate(batch)) {
      const details = validate.errors.slice(0,8).map(({ instancePath,message }) => `${instancePath || '/'} ${message}`).join('\n')
      throw new Error('Contrato editorial inválido\n'+details)
    }
    if (batch.status === 'sample' || batch.revision > 999999 || batchIds.has(batch.batchId)
      || batch.questions.length !== batch.expectedCount || batch.questions.at(-1).id !== batch.lastId) {
      throw new Error('Bateria inválida ou duplicada: ' + batch.batchId)
    }
    batchIds.add(batch.batchId)
    for (const [entries,target] of [[batch.competencies,skills],[batch.misconceptions,null]]) {
      if (new Set(entries.map(({id}) => id)).size !== entries.length) throw new Error('Catálogo duplicado: ' + batch.batchId)
      for (const {id,description} of entries) {
        const previous = target ? target[id] : misconceptions.get(id)
        if (previous !== undefined && previous !== description) throw new Error('Catálogo editorial divergente: ' + id)
        if (target) target[id]=description
        else misconceptions.set(id,description)
      }
    }
  }
  for (const batch of batches) {
    const start = batch.firstId.match(/^(.*-)(\d+)$/)
    for (const [index,q] of batch.questions.entries()) {
      const expected = start[1]+String(Number(start[2])+index).padStart(start[2].length,'0')
      if (!itemPattern.test(q.id) || q.id !== expected || questions.has(q.id)) throw new Error('ID editorial duplicado ou fora da sequência: ' + q.id)
      questions.add(q.id)
      if (!q.competencies.length || q.competencies.some((id) => !Object.hasOwn(skills,id))
        || q.misconceptions.some((id) => !misconceptions.has(id)) || q.prerequisites.some((entry) => !entry.trim())) {
        throw new Error('Competência, erro ou pré-requisito inválido em ' + q.id)
      }
      const map = context.get(q.id)
      const lessons = sortedUnique(map?.lessons ?? (map?.proposedLesson ? ['omni-content-001/'+map.proposedLesson] : []))
      const formations = sortedUnique(map?.formations ?? [q.id.startsWith('EN-') ? 'english' : 'tech'])
      if (lessons.some((item) => !lessonPattern.test(item)) || !formations.length || formations.some((item) => !['english','tech'].includes(item))) {
        throw new Error('Contexto inválido em ' + q.id)
      }
      const projected = activityFor(q,map)
      if (!projected) {
        const reason = q.kind==='debug' ? 'Depuração exige correção da solução e avaliação dos critérios do código.' :
          'Resposta livre, seleção com descarte ou raciocínio que exige rubrica humana.'
        report.push({ editorialId:q.id, format:q.kind, previous:map?.disposition, status:'editorial-only', reason })
        continue
      }
      if (q.title.length>180 || q.topic.length>250 || q.competencies.length>32
        || textSize(projected.activity)>32768 || textSize(projected.grading)>65536) throw new Error('Atividade excede os limites em ' + q.id)
      const { id: unusedId, ...body } = projected.activity
      void unusedId
      const fingerprint = JSON.stringify(body)
      if (fingerprints.has(fingerprint)) throw new Error('Atividades duplicadas: '+fingerprints.get(fingerprint)+' e '+q.id)
      fingerprints.set(fingerprint,q.id)
      const item = { id:q.id, version:batch.revision, title:q.title, topic:q.topic, module:batch.moduleId, formations, lessons,
        skills:sortedUnique(q.competencies), misconceptions:sortedUnique(q.misconceptions), prerequisites:q.prerequisites,
        difficulty:q.difficulty, kind:q.kind, ...projected }
      items.push(item)
      report.push({ editorialId:q.id, version:item.version, format:q.kind, previous:map?.disposition, status:'compatible',
        ...(projected.grading.partial ? { note:'Pontuação por pares corretos.' } : {}) })
    }
  }
  return { items, skills, report, drafts: batches.some(({status}) => status !== 'reviewed') }
}

export function toPracticeSql({ items, skills, drafts }) {
  const json = (value) => "'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb"
  const guard = drafts ? `DO $$ BEGIN\n  IF current_database() !~ '^academy_practice_[a-z0-9_]+_synthetic$' THEN\n    RAISE EXCEPTION 'Conteúdo em revisão: use apenas a base descartável da Academy';\n  END IF;\nEND $$;\n` : ''
  return `-- Material privado. Não inclua no Git ou em public/.\nBEGIN;\nSET LOCAL standard_conforming_strings = on;\n${guard}SELECT public.academy_practice_import(${json(items)}, ${json(skills)});\nCOMMIT;\n`
}

async function privateOutput(path) {
  const target = resolve(await realpath(dirname(resolve(path))),basename(path))
  const inside = relative(await realpath(fileURLToPath(root)),target)
  if (!isAbsolute(inside) && inside !== '..' && !inside.startsWith('..'+sep) && !inside.startsWith('private'+sep)) {
    throw new Error('Grave o material em private/ ou fora do repositório.')
  }
  return target
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const { values, positionals } = parseArgs({ allowPositionals:true, options:{ schema:{type:'string'}, map:{type:'string'},
      out:{type:'string'}, report:{type:'string'}, 'allow-drafts':{type:'boolean'} } })
    if (!positionals.length || !values.schema) throw new Error('Use arquivos ou pastas de baterias e --schema, com --map, --report e --out opcionais.')
    const paths = []
    for (const path of positionals) {
      if ((await stat(path)).isDirectory()) paths.push(...(await readdir(path)).filter((name) => /^bateria-.*\.json$/i.test(name)).sort().map((name) => resolve(path,name)))
      else paths.push(path)
    }
    const [batches,schema,map] = await Promise.all([Promise.all(paths.map(readJson)), readJson(values.schema), values.map ? readJson(values.map) : null])
    const validator = new Ajv2020({ allErrors:true }).compile(schema)
    const result = preparePractice(batches,validator,map?.entries ?? [])
    if (values.out && result.drafts && !values['allow-drafts']) throw new Error('Revise as baterias ou use --allow-drafts apenas para testes descartáveis.')
    if (values.report) {
      const target = await privateOutput(values.report)
      if (extname(target)!=='.json') throw new Error('O relatório precisa usar .json.')
      await writeFile(target, JSON.stringify(result.report,null,2)+'\n',{ flag:'wx',mode:0o600 })
    }
    if (values.out) {
      const target = await privateOutput(values.out)
      if (extname(target)!=='.sql') throw new Error('O arquivo de importação precisa usar .sql.')
      await writeFile(target,toPracticeSql(result),{ flag:'wx',mode:0o600 })
    }
    console.log(`${result.report.length} editoriais · ${result.items.length} compatíveis · ${result.report.length-result.items.length} retidas`)
  } catch (error) {
    console.error(error.message)
    process.exitCode=1
  }
}
