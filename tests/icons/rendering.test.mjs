import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { importIcons } from '../helpers/icon-imports.mjs'

const { AcademyIcon, Search, ReviewsIcon } = importIcons()

test('os ícones distinguem ilustrações decorativas de imagens com rótulo', () => {
  const decorative = renderToStaticMarkup(createElement(Search, { size: 16 }))
  assert.match(decorative, /width="16" height="16"/)
  assert.match(decorative, /aria-hidden="true"/)
  assert.match(decorative, /data-icon-family="solar"/)

  const informative = renderToStaticMarkup(createElement(ReviewsIcon, { label: 'Revisão ativa', mode: 'mono' }))
  assert.match(informative, /role="img" aria-label="Revisão ativa"/)
  assert.match(informative, /data-icon-mode="mono"/)
  assert.doesNotMatch(informative, /aria-hidden|linearGradient/)
})

test('instâncias coloridas usam gradientes isolados durante a renderização', () => {
  const markup = renderToStaticMarkup(createElement('div', null,
    createElement(AcademyIcon, { mode: 'color' }),
    createElement(AcademyIcon, { mode: 'color' }),
  ))
  const ids = [...markup.matchAll(/<linearGradient id="([^"]+)"/g)].map(([, id]) => id)
  assert.equal(ids.length, 2)
  assert.equal(new Set(ids).size, 2)
  for (const id of ids) assert.ok(markup.includes(`url(#${id})`))
  assert.match(markup, /--omni-dark-start:/)
  assert.match(markup, /--omni-light-start:/)
})
