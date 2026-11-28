import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const entry = fileURLToPath(new URL('../../src/components/icons/index.ts', import.meta.url))
const modules = new Map()
const nodeRequire = createRequire(import.meta.url)

function load(path) {
  if (modules.has(path)) return modules.get(path)
  const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), {
    fileName: path,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
    },
  })
  const exports = {}
  const loadDependency = (name) => {
    if (!name.startsWith('./')) return nodeRequire(name)
    const base = resolve(dirname(path), name)
    return load(existsSync(base + '.ts') ? base + '.ts' : base + '.tsx')
  }
  new Function('exports', 'require', outputText)(exports, loadDependency)
  modules.set(path, exports)
  return exports
}

export function importIcons() {
  return load(entry)
}

export function createUiRequire(url) {
  const require = createRequire(url)
  return (name) => name === '@/components/icons' ? importIcons() : require(name)
}
