'use client'

import { ArrowDown, ArrowUp } from '@/components/icons'
import type { ActivityItem, GradedExercise } from '@/lib/academy/contracts'

type ResponseValue = string | string[] | { id: string; indent: number }[] | Record<string, string>

function fieldValue(fields: Record<string, string>, id: string) {
  return Object.hasOwn(fields, id) ? fields[id] : ''
}

export function initialResponse(exercise: GradedExercise): ResponseValue {
  if (exercise.kind === 'ordering') return []
  if (exercise.kind === 'parsons') return exercise.lines.map(({ id }) => ({ id, indent: 0 }))
  if (exercise.kind === 'matching' || exercise.kind === 'trace' || exercise.kind === 'fill-in') return {}
  return ''
}

export function activityAnswer(exercise: GradedExercise, value: ResponseValue) {
  const kind = exercise.kind
  if (kind === 'output') return typeof value === 'string' ? value : null
  if (kind === 'text') return typeof value === 'string' && value.trim() ? value : null
  if (kind === 'multiple-choice') return value ? JSON.stringify(value) : null
  if (kind === 'ordering' && (!Array.isArray(value) || value.length !== exercise.items.length)) return null
  if (kind === 'matching' || kind === 'trace' || kind === 'fill-in') {
    const fields = kind === 'matching' ? exercise.left : exercise.fields
    if (!fields.every(({ id }) => fieldValue(value as Record<string, string>, id).trim())) return null
  }
  return JSON.stringify(value)
}

function OrderedItems<T extends { id: string }>({ rows, definitions, update, indent, disabled }: {
  rows: T[]
  definitions: ActivityItem[]
  update: (rows: T[]) => void
  indent?: { maximum: number; value: (row: T) => number; update: (row: T, value: number) => T }
  disabled: boolean
}) {
  function move(from: number, to: number) {
    const next = [...rows]
    const [row] = next.splice(from, 1)
    next.splice(to, 0, row)
    update(next)
  }
  return <ol className="ac-sortable">
    {rows.map((row, index) => {
      const label = definitions.find((item) => item.id === row.id)?.label ?? row.id
      return <li key={row.id}>
        <span className="ac-sort-position" aria-hidden="true">{index + 1}</span>
        {indent ? <code>{' '.repeat(4 * indent.value(row))}{label}</code> : <span>{label}</span>}
        <span className="ac-item-controls">
          {indent && <select aria-label={`Recuo da linha ${index + 1}`} value={indent.value(row)} disabled={disabled}
            onChange={(event) => update(rows.map((item) => item.id === row.id ? indent.update(item, Number(event.target.value)) : item))}>
            {Array.from({ length: indent.maximum + 1 }, (_, i) => <option key={i} value={i}>{i * 4} espaços</option>)}
          </select>}
          <button type="button" className="ac-btn" disabled={disabled || index === 0}
            onClick={() => move(index, index - 1)} aria-label={`Mover item ${index + 1} para cima`}><ArrowUp size={15} aria-hidden="true" /></button>
          <button type="button" className="ac-btn" disabled={disabled || index === rows.length - 1}
            onClick={() => move(index, index + 1)} aria-label={`Mover item ${index + 1} para baixo`}><ArrowDown size={15} aria-hidden="true" /></button>
        </span>
      </li>
    })}
  </ol>
}

export function ActivityInput({ exercise, value, onChange, disabled, multilineFields }: {
  exercise: GradedExercise
  value: ResponseValue
  onChange: (value: ResponseValue) => void
  disabled: boolean
  multilineFields?: string[]
}) {
  const control = `ac-answer-${exercise.id}`
  const describedBy = `ac-prompt-${exercise.id}`
  if (exercise.kind === 'text' || exercise.kind === 'output') {
    return <>
      <label htmlFor={control}>{exercise.kind === 'text' ? 'Sua resposta' : 'Saída prevista'}</label>
      {exercise.kind === 'text' ? <input id={control} value={value as string} maxLength={600}
        required aria-describedby={describedBy} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
        : <textarea id={control} value={value as string} maxLength={4000} rows={5} spellCheck={false}
          aria-describedby={describedBy} disabled={disabled} onChange={(event) => onChange(event.target.value)} />}
    </>
  }
  if (exercise.kind === 'multiple-choice') return <fieldset aria-describedby={describedBy} disabled={disabled} className="ac-choice-set ac3-options">
    <legend>Escolha uma alternativa</legend>
    {exercise.options.map(({ id, label }, index) => <label key={id} className="ac-choice">
      <input type="radio" name={control} value={id} checked={value === id} onChange={() => onChange(id)} />
      <span aria-hidden="true">{String.fromCharCode(65 + index)} ·</span><span>{label}</span>
    </label>)}
  </fieldset>
  if (exercise.kind === 'ordering') {
    const order = value as string[]
    return <div className="ac3-order-game">
      <p>Selecione as peças na ordem desejada.</p>
      <div className="ac3-actions" role="group" aria-label="Peças disponíveis">{exercise.items.map(({ id, label }) =>
        <button key={id} type="button" disabled={disabled || order.includes(id)} onClick={() => onChange([...order, id])}>{label}</button>)}</div>
      <div className="ac3-codeout" aria-live="polite">{order.length
        ? order.map((id) => exercise.items.find((item) => item.id === id)?.label).join(' → ') : 'Escolha as peças…'}</div>
      <div className="ac3-actions">
        <button type="button" className="ac3-ghost" disabled={disabled || !order.length} onClick={() => onChange(order.slice(0, -1))}>Desfazer última peça</button>
        <button type="button" className="ac3-ghost" disabled={disabled || !order.length} onClick={() => onChange([])}>Reorganizar</button>
      </div>
    </div>
  }
  if (exercise.kind === 'parsons') return <OrderedItems rows={value as { id: string; indent: number }[]} definitions={exercise.lines}
    disabled={disabled} update={onChange} indent={{ maximum: exercise.maxIndent, value: (row) => row.indent,
      update: (row, indent) => ({ ...row, indent }) }} />

  const answers = value as Record<string, string>
  if (exercise.kind === 'matching') return <div className="ac-fields ac-matching-fields">
    {exercise.left.map(({ id, label }) => <label key={id}>
      <span>{label}</span><span className="ac-match-link" aria-hidden="true">→</span><select aria-label={'Par de ' + label} value={fieldValue(answers, id)} disabled={disabled} onChange={(event) => onChange({ ...answers, [id]: event.target.value })}>
        <option value="">Escolha o par</option>
        {exercise.right.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </label>)}
  </div>
  return <div className="ac-fields">{exercise.fields.map(({ id, label }) => <label key={id}>
    <span>{label}</span>{multilineFields?.includes(id)
      ? <textarea rows={4} maxLength={4000} spellCheck={false} value={fieldValue(answers,id)} disabled={disabled}
        onChange={(event) => onChange({ ...answers,[id]:event.target.value })} />
      : <input maxLength={300} value={fieldValue(answers, id)} disabled={disabled}
        onChange={(event) => onChange({ ...answers, [id]: event.target.value })} />}
  </label>)}</div>
}
