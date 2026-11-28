import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const packageDir = new URL('./', import.meta.resolve('skulpt/package.json'))
export async function pythonRuntimeSource() {
  if (require('skulpt/package.json').version !== '1.2.0') throw new Error('Revise a versão do runtime Python antes de publicar.')
  const [runtime, sys] = await Promise.all([
    readFile(new URL('dist/skulpt.min.js', packageDir), 'utf8'),
    readFile(new URL('src/builtin/sys.js', packageDir), 'utf8'),
  ])
  return runtime + '\nglobalThis.academySkulptSys = ' + JSON.stringify(sys) + ';\n'
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const runtimeDir = new URL('../public/academy/runtime/', import.meta.url)
  await mkdir(runtimeDir, { recursive: true })
  await Promise.all([
    writeFile(new URL('skulpt-1.2.0.js', runtimeDir), await pythonRuntimeSource()),
    copyFile(new URL('LICENSE', packageDir), new URL('skulpt-license.txt', runtimeDir)),
  ])
}
