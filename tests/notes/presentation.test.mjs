import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createUiRequire } from '../helpers/icon-imports.mjs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import * as noteImages from '../../src/lib/note-image.ts'

const requireModule = createUiRequire(import.meta.url)
const noop = () => undefined
const load = (path, stubs = {}) => {
  const source = readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  })
  const exports = {}
  new Function('exports', 'require', outputText)(exports, (name) => {
    if (name.endsWith('.css')) return {}
    return stubs[name] ?? requireModule(name)
  })
  return exports.default
}
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))
const note = { id: 'nota-a', title: 'Consultas SQL', content: 'Rever WHERE e HAVING.', updated_at: '2026-11-24T00:00:00Z' }
const Editor = load('src/components/MarkdownEditor.tsx', {
  'react-markdown': ({ children }) => createElement('p', null, children),
  'remark-gfm': noop, 'remark-math': noop, 'rehype-katex': noop,
  '@/actions/notes': { updateNoteContent: noop },
  '@/actions/flashcards': {},
  '@/actions/groq': {},
  '@/hooks/useAudioRecorder': { useAudioRecorder: () => ({ startRecording: noop, stopRecording: noop }) },
  '@/hooks/useHistory': { useHistory: (content) => ({ value: content, setValue: noop, undo: noop, redo: noop }) },
  '@/lib/note-image': noteImages,
  '@/utils/supabase/client': { createClient: () => ({}) },
  './Sketchpad': noop, './LaTeXAssist': noop,
})

test('editor apresenta controles de visualização, formatação e salvamento automático', () => {
  const html = render(Editor, { initialNote: note })
  assert.match(html, /Editor Markdown/)
  assert.match(html, /aria-label="Editar" aria-pressed="true"/)
  assert.match(html, /aria-label="Visualizar" aria-pressed="false"/)
  assert.match(html, /aria-label="Lado a Lado" aria-pressed="false"/)
  assert.match(html, /aria-label="Modo de geração de flashcards"/)
  assert.match(html, /aria-label="Buscar na nota"/)
  assert.match(html, /aria-label="Conteúdo da anotação"/)
  assert.match(html, /aria-label="Formatação e anexos"/)
  assert.match(html, /Rever WHERE e HAVING/)
  assert.match(html, /Salvamento automático/)
  assert.match(html, /4 palavras/)
})

test('página preserva a navegação de volta, flashcards, estudo e importação recolhida', async () => {
  const Title = load('src/components/EditableNoteTitle.tsx', { '@/actions/notes': { updateNoteTitle: noop } })
  const Importer = load('src/components/CollapsiblePdfImporter.tsx', { './PdfImporter': () => createElement('p', null, 'Envio de PDF') })
  const reads = []
  const Page = load('src/app/dashboard/[workspaceId]/note/[noteId]/page.tsx', {
    '@/actions/notes': { getNoteById: (...ids) => { reads.push(ids); return note } },
    '@/components/MarkdownEditor': Editor,
    '@/components/CollapsiblePdfImporter': Importer,
    '@/components/EditableNoteTitle': Title,
    'next/link': ({ children, ...props }) => createElement('a', props, children),
    'next/navigation': { notFound() { throw new Error('Nota ausente') } },
  })
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ workspaceId: 'espaco-a', noteId: 'nota-a' }) }))
  assert.deepEqual(reads, [['nota-a', 'espaco-a']])
  assert.match(html, /aria-label="Título da anotação"/)
  assert.match(html, /value="Consultas SQL"/)
  assert.match(html, /href="\/dashboard\/espaco-a"/)
  assert.match(html, /href="\/dashboard\/espaco-a\/note\/nota-a\/flashcards"/)
  assert.match(html, /href="\/dashboard\/revisoes\?workspaceId=espaco-a&amp;noteId=nota-a"/)
  const [, importerId] = html.match(/aria-expanded="false" aria-controls="([^"]+)"/)
  assert.ok(html.includes(`id="${importerId}" class="nt-pdf-body" hidden=""`))
  assert.doesNotMatch(html, /Envio de PDF/)
})
