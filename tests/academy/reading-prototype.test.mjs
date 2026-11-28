import test from 'node:test'
import assert from 'node:assert/strict'
import { splitLessonSections } from '../../src/lib/academy/reading.ts'

test('organiza o Markdown em etapas sem perder introdução, exemplos ou subtítulos', () => {
  const markdown = [
    'Texto de abertura.', '', '## Conceito ##', 'Uma explicação.',
    '### Detalhe', '- Primeiro item', '', '## Aplicação', 'Um exemplo.',
  ].join('\r\n')
  const result = splitLessonSections(markdown)
  assert.deepEqual(result.map(({ title }) => title), ['Introdução', 'Conceito', 'Aplicação'])
  assert.equal(result[0].markdown, 'Texto de abertura.')
  assert.equal(result[1].markdown, 'Uma explicação.\n### Detalhe\n- Primeiro item')
  assert.equal(result[2].markdown, 'Um exemplo.')
})

test('ignora cabeçalhos dentro de blocos de Python ou Markdown', () => {
  const ticks = String.fromCharCode(96).repeat(3)
  const lines = ['## Código', ticks + 'python', '## comentário', 'print(1)', ticks,
    '~~~markdown', '## Exemplo', '~~~', '## Depois', 'Fim.']
  const result = splitLessonSections(lines.join('\n'))
  assert.deepEqual(result.map(({ title }) => title), ['Código', 'Depois'])
  assert.equal(result[0].markdown, lines.slice(1, 8).join('\n'))
})

test('mantém uma etapa para aula sem divisão por cabeçalhos', () => {
  assert.deepEqual(splitLessonSections('# Título\n\nConteúdo.'), [{ title: 'Introdução', markdown: '# Título\n\nConteúdo.' }])
})
