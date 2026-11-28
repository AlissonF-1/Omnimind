'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, CircleAlert, Code2, Play, Save, Square, Terminal } from '@/components/icons'
import type { PythonExercise } from '@/lib/academy/contracts'
import { runPython, type PythonResult } from '@/lib/academy/python'
import { normalizePracticeOutput } from '@/lib/academy/practice'
import { InlineCode } from './InlineCode'

function Highlight({ code }: { code: string }) {
  const tokens = code.split(/(#[^\n]*|"(?:\\.|[^"\n])*"|'(?:\\.|[^'\n])*'|\b(?:if|elif|else|for|in|while|def|return|True|False|None|import|from|pass|print|input|int|float|str|range|len|break|continue|and|or|not)\b|\b\d+(?:\.\d+)?\b)/)
  return tokens.map((token, index) => index % 2 ?
    <span key={index} className={token.startsWith('#') ? 'ac-comment' : /^['"]/.test(token) ? 'ac-string' : 'ac-token'}>{token}</span> : token)
}

export default function PythonLab({ exercise, code, onChange, saveStatus, practiceMode = false }: {
  exercise: PythonExercise; code: string; onChange: (code: string) => void; saveStatus?: string; practiceMode?: boolean
}) {
  const [input, setInput] = useState(exercise.publicCases[0]?.input ?? '')
  const [result, setResult] = useState<PythonResult | null>(null)
  const [phase, setPhase] = useState<'run' | 'test' | null>(null)
  const [caseResults, setCaseResults] = useState<{ id: string; passed: boolean; label: string }[]>([])
  const [hints, setHints] = useState(0)
  const running = useRef<AbortController | null>(null)
  const paint = useRef<HTMLPreElement>(null)
  const gutter = useRef<HTMLPreElement>(null)
  useEffect(() => () => running.current?.abort(), [])

  async function run(mode: 'run' | 'test') {
    if (running.current) return
    const controller = new AbortController()
    running.current = controller
    setPhase(mode)
    setResult(null)
    setCaseResults([])
    try {
      if (mode === 'run') setResult(await runPython(code, input, controller.signal))
      else {
        for (const item of exercise.publicCases) {
          const outcome = await runPython(code, item.input, controller.signal)
          const normalize = practiceMode ? normalizePracticeOutput : (value: string) => value.trimEnd()
          const passed = outcome.status === 'ok' && normalize(outcome.output) === normalize(item.expected)
          setCaseResults((previous) => [...previous, { id: item.id, passed, label: outcome.message ||
            (passed ? 'Saída esperada' : `Esperado: ${item.expected}. Recebido: ${outcome.output || 'sem saída'}`) }])
          if (outcome.status === 'timeout') break
        }
      }
    } catch (error) {
      setResult({ status: 'error', output: '', message: controller.signal.aborted ? 'Execução interrompida.' :
        error instanceof Error ? error.message : 'Não foi possível executar o programa.' })
    } finally {
      running.current = null
      setPhase(null)
    }
  }

  return <>
    <details className="ac-lab-brief"><summary>Enunciado do desafio</summary><p><InlineCode text={exercise.prompt} /></p></details>
    <div className="ac-editor">
      <div className="ac-split-heading"><span className="ac-editor-label"><Code2 size={16} aria-hidden="true" /> Editor Python</span>
        <small>Skulpt · no navegador</small></div>
      <div className="ac-codebox ac-codebox-numbered">
        <pre className="ac-code-gutter" ref={gutter} aria-hidden="true">{code.split('\n').map((_, index) => index + 1).join('\n') + '\n'}</pre>
        <pre ref={paint} aria-hidden="true"><code><Highlight code={code + '\n'} /></code></pre>
        <textarea aria-label="Código Python" value={code} maxLength={12000} spellCheck={false} autoCapitalize="off" autoComplete="off" wrap="off"
          onChange={(event) => onChange(event.target.value)}
          onScroll={(event) => {
            if (paint.current) { paint.current.scrollLeft = event.currentTarget.scrollLeft; paint.current.scrollTop = event.currentTarget.scrollTop }
            if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop
          }}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void run('run') }
          }} />
      </div>
      <details className="ac-lab-fold"><summary>Entrada do programa</summary><label className="ac-lab-input">
        <textarea aria-label="Entrada para o programa" rows={2} value={input} maxLength={2000}
          onChange={(event) => setInput(event.target.value)} placeholder="Uma entrada por linha (opcional)" />
      </label></details>
    </div>
    <div className="ac-actions">
      <button type="button" className="ac-btn ac-primary" disabled={Boolean(phase) || !code.trim()} onClick={() => void run('run')}>
        <Play size={16} aria-hidden="true" /> Executar
      </button>
      <button type="button" className="ac-btn" disabled={Boolean(phase) || !code.trim()} onClick={() => void run('test')}>Testar exemplos</button>
      {phase && <button type="button" className="ac-btn" onClick={() => running.current?.abort()}><Square size={14} aria-hidden="true" /> Interromper</button>}
      {hints < exercise.hints.length && <button type="button" className="ac-btn ac-subtle" onClick={() => setHints((count) => count + 1)}>Pedir dica</button>}
    </div>
    <p className="ac-status" role="status"><Save size={14} aria-hidden="true" /> {saveStatus || 'O rascunho é salvo durante a edição.'}</p>
    {hints > 0 && <ol className="ac-hints">{exercise.hints.slice(0, hints).map((hint) => <li key={hint}><InlineCode text={hint} /></li>)}</ol>}
    <div className="ac-console" aria-label="Saída do programa" aria-live="polite">
      <div className="ac-split-heading"><strong><Terminal size={16} aria-hidden="true" /> Console</strong>
        {result && <span className="ac-state" data-tone={result.status === 'ok' ? 'complete' : 'review'}>{result.status === 'ok' ? 'Concluído' : result.status === 'timeout' ? 'Tempo limite' : 'Interrompido'}</span>}</div>
      {phase && <p>{phase === 'test' ? 'Executando os exemplos…' : 'Executando o programa…'}</p>}
      {result && <><p>{result.status === 'ok' ? 'Execução concluída' : result.message}</p>{result.output && <pre>{result.output}</pre>}</>}
      {caseResults.length > 0 && <ul>{caseResults.map((entry) => <li key={entry.id} data-passed={entry.passed}>
        <strong>{entry.passed ? <CheckCircle2 size={15} aria-hidden="true" /> : <CircleAlert size={15} aria-hidden="true" />}
          {entry.passed ? 'Passou' : 'Falhou'} · {entry.id}</strong><span>{entry.label}</span></li>)}</ul>}
      {!result && !caseResults.length && !phase && <p>A saída aparecerá aqui.</p>}
    </div>
    <p className="ac-footnote">{practiceMode ? 'Os exemplos públicos conferem a saída no navegador. O registro do código indica prática, sem nota.' :
      'Os testes do laboratório são exemplos públicos de prática. O progresso da aula usa as atividades corrigidas no servidor.'}</p>
  </>
}
