export type PythonResult = { status: 'ok' | 'error' | 'timeout'; output: string; message: string }

let assets: Promise<[string, string]> | undefined

function loadPythonAssets() {
  assets ??= Promise.all(['/academy/runtime/skulpt-1.2.0.js', '/academy/python-worker.js'].map(async (path) => {
    const res = await fetch(path, { signal: AbortSignal.timeout(12000), redirect: 'error' })
    if (!res.ok || !/(?:javascript|ecmascript)/i.test(res.headers.get('content-type') ?? '')) {
      throw new Error('Não foi possível carregar o interpretador.')
    }
    return res.text()
  }) as [Promise<string>, Promise<string>]).catch((error) => {
    assets = undefined
    throw error
  })
  return assets
}

export async function runPython(code: string, input: string, signal: AbortSignal): Promise<PythonResult> {
  if (!code.trim() || new TextEncoder().encode(code).length > 12000 || input.length > 2000) {
    return { status: 'error', output: '', message: 'Informe um código de até 12 KB e entrada de até 2.000 caracteres.' }
  }
  const [runtime, worker] = await loadPythonAssets()
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    const nonce = crypto.randomUUID()
    frame.setAttribute('sandbox', 'allow-scripts')
    frame.hidden = true
    frame.title = 'Executor Python isolado'
    frame.src = '/academy/python-frame.html'

    function finish(result?: PythonResult) {
      clearTimeout(deadline)
      signal.removeEventListener('abort', stop)
      window.removeEventListener('message', receive)
      frame.remove()
      if (result) resolve(result)
      else reject(new DOMException('Execução cancelada.', 'AbortError'))
    }
    function stop() { finish() }
    function receive(event: MessageEvent) {
      if (event.origin !== 'null' || event.source !== frame.contentWindow
        || event.data?.type !== 'omni-python-result' || event.data.nonce !== nonce) return
      const result: Partial<PythonResult> = event.data.result ?? {}
      if (!['ok', 'error', 'timeout'].includes(result.status ?? '') || typeof result.output !== 'string' || typeof result.message !== 'string') return
      finish({ status: result.status!, output: result.output.slice(0, 4000), message: result.message.slice(0, 450) })
    }
    const deadline = setTimeout(() => finish({ status: 'timeout', output: '', message: 'Execução interrompida por tempo limite.' }), 6500)
    signal.addEventListener('abort', stop, { once: true })
    window.addEventListener('message', receive)
    frame.onload = () => frame.contentWindow?.postMessage({ type: 'omni-python-run', nonce, runtime, worker, code, input }, '*')
    document.body.appendChild(frame)
  })
}
