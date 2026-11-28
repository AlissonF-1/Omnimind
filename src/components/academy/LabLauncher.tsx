'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LabIcon } from '@/components/icons'
import { getAcademyPythonChallenge, recordAcademyActivity } from '@/actions/academy'
import type { AcademyResource, LessonRef, PythonExercise } from '@/lib/academy/contracts'
import { ExerciseResource } from './ExerciseResource'

const PythonLab = dynamic(() => import('./PythonLab'), {
  ssr: false, loading: () => <p role="status">Carregando o editor…</p>,
})

type ChallengeLink = { id: string; label: string; resource?: AcademyResource }
type Entry = { exercise: PythonExercise; code: string; saved: boolean }

export function LabLauncher({ challenges, lesson, account }: { challenges: ChallengeLink[]; lesson: LessonRef; account: string }) {
  const [selected, setSelected] = useState('')
  const [entries, setEntries] = useState<Record<string, Entry>>({})
  const [statuses, setStatuses] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; code: string }>())
  const saveQueue = useRef(Promise.resolve())
  const mounted = useRef(false)
  const { release, version, lesson: lessonId } = lesson
  const current = Object.hasOwn(entries, selected) ? entries[selected] : undefined
  const error = Object.hasOwn(errors, selected) ? errors[selected] : ''
  const status = Object.hasOwn(statuses, selected) ? statuses[selected] : undefined

  const flush = useCallback((id: string) => {
    const edit = pending.current.get(id)
    if (!edit) return
    clearTimeout(edit.timer)
    pending.current.delete(id)
    saveQueue.current = saveQueue.current.then(async () => {
      let status = 'Rascunho salvo.'
      try {
        const result = await recordAcademyActivity({ release, version, lesson: lessonId }, 'draft',
          { exercise: id, code: edit.code, account })
        if ('error' in result) status = result.error
      } catch { status = 'Sem conexão para salvar o rascunho.' }
      if (!mounted.current) return
      setEntries((before) => {
        const item = Object.hasOwn(before, id) ? before[id] : undefined
        return item && item.code === edit.code ? { ...before, [id]: { ...item, saved: status === 'Rascunho salvo.' } } : before
      })
      setStatuses((before) => ({ ...before, [id]: status }))
    })
  }, [account, lessonId, release, version])

  useEffect(() => {
    const edits = pending.current
    mounted.current = true
    return () => {
      mounted.current = false
      for (const id of edits.keys()) flush(id)
    }
  }, [flush])

  async function selectChallenge(id: string) {
    if (selected && selected !== id) flush(selected)
    setSelected(id)
    if (Object.hasOwn(entries, id)) return
    setErrors((before) => ({ ...before, [id]: '' }))
    try {
      const result = await getAcademyPythonChallenge(lesson, id, account)
      if ('exercise' in result && result.exercise) {
        const { exercise, draft } = result
        setEntries((before) => Object.hasOwn(before, id) ? before : {
          ...before, [id]: { exercise, code: draft ?? exercise.starter, saved: true },
        })
        if (draft !== null) setStatuses((before) => ({ ...before, [id]: 'Rascunho recuperado.' }))
      } else setErrors((before) => ({ ...before, [id]: result.error ?? 'Desafio indisponível.' }))
    } catch { setErrors((before) => ({ ...before, [id]: 'Sem conexão para abrir o desafio.' })) }
  }

  function editCode(code: string) {
    setEntries((before) => ({ ...before, [selected]: { ...before[selected], code, saved: false } }))
    queueEdit(code)
  }

  function queueEdit(code: string) {
    setStatuses((before) => ({ ...before, [selected]: 'Salvando rascunho…' }))
    const earlier = pending.current.get(selected)
    if (earlier) clearTimeout(earlier.timer)
    pending.current.set(selected, { code, timer: setTimeout(() => flush(selected), 900) })
  }

  return <section className="ac-panel ac-lab" id="laboratorio">
    <div className="ac-split-heading"><div className="ac-section-title"><LabIcon size={25} mode="color" aria-hidden="true" /><h2>Laboratório Python</h2></div>
      <small>{challenges.length} {challenges.length === 1 ? 'desafio' : 'desafios'}</small></div>
    {selected ? <>
      {challenges.length > 1 && <label className="ac-lab-input">Selecionar desafio Python
        <select value={selected} onChange={(event) => void selectChallenge(event.target.value)}>
          {challenges.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>}
      {current ? <>
        <ExerciseResource resource={challenges.find(({ id }) => id === selected)?.resource} />
        <PythonLab key={selected} exercise={current.exercise} code={current.code} onChange={editCode} saveStatus={status} />
        {!current.saved && <button type="button" className="ac-btn" onClick={() => {
          queueEdit(current.code)
          flush(selected)
        }}>Salvar rascunho agora</button>}
      </> : error ? <div>
        <p role="alert">{error}</p><button type="button" className="ac-btn" onClick={() => void selectChallenge(selected)}>Tentar novamente</button>
      </div> : <p role="status">Carregando o desafio…</p>}
    </> : <div className="ac-lab-start">
      <span>Editor Python</span><p>Abra um desafio para editar o código, executar exemplos e acompanhar a saída no console.</p>
      <div className="ac-lab-choices">{challenges.map(({ id, label }) => <button key={id} type="button" className="ac-btn ac-primary"
        onClick={() => void selectChallenge(id)} aria-label={'Abrir editor Python: ' + label}>
        {challenges.length === 1 ? 'Abrir editor Python' : label}
      </button>)}</div>
    </div>}
  </section>
}
