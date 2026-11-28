/* global Sk */
'use strict'

globalThis.onmessage = async ({ data }) => {
  let output = ''
  const input = data.input.replace(/\r\n/g, '\n').split('\n')
  const status = (value, message) => globalThis.postMessage({ status: value, output, message })
  try {
    Sk.configure({
      __future__: Sk.python3,
      execLimit: 1700,
      yieldLimit: 60,
      inputfunTakesPrompt: true,
      inputfun(prompt) {
        append(prompt)
        const line = input.shift()
        if (line === undefined) throw new Sk.builtin.RuntimeError('A entrada terminou. Informe mais uma linha.')
        return line
      },
      read(path) {
        if (path === 'src/builtin/sys.js') return globalThis.academySkulptSys
        throw new Sk.builtin.ImportError('Este laboratório utiliza apenas as funções básicas de Python.')
      },
      output: append,
    })
    await Sk.misceval.asyncToPromise(() => Sk.importMainWithBody('academy', false, data.code, true))
    status('ok', '')
  } catch (error) {
    const message = String(error).slice(0, 450)
    status(/timelimit|time limit/i.test(message) ? 'timeout' : 'error', message)
  }
  function append(value) {
    output += String(value).slice(0, 4000 - output.length)
    if (output.length >= 4000) throw new Sk.builtin.RuntimeError('Limite de saída atingido.')
  }
}
