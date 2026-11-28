'use client'

import { useState } from 'react'
import { RotateCcw, StepForward } from '@/components/icons'
import type { AcademyLesson } from '@/lib/academy/contracts'

export function VariableVisualizer({ visual }: { visual: NonNullable<AcademyLesson['visual']> }) {
  const [step, setStep] = useState(0)
  const comparing = visual.kind === 'counter'
  const end = comparing ? visual.end - visual.start : 1
  const value = comparing ? visual.start + step : step === 0 ? visual.start : visual.end
  const threshold = Math.round((visual.start + visual.end) / 2)
  return <section className="ac-panel ac-demo" id="experimentar">
    <div className="ac-section-title"><StepForward size={20} aria-hidden="true" /><h2>{comparing ? 'Teste a condição' : 'Acompanhe a variável'}</h2></div>
    <p>{comparing ? 'Passe por cada valor e observe qual bloco executa.' : 'Avance uma instrução para ver o valor guardado mudar.'}</p>
    <div className="ac-demo-code"><code>{comparing ? `if ${visual.name} >= ${threshold}:` :
      step ? `${visual.name} = ${visual.name} + ${visual.end - visual.start}` : `${visual.name} = ${visual.start}`}</code></div>
    <div className="ac-demo-steps" role="group" aria-label="Etapas da demonstração">
      {Array.from({ length: end + 1 }, (_, index) => <button type="button" className="ac-btn" key={index}
        aria-pressed={index === step} onClick={() => setStep(index)} aria-label={'Etapa ' + (index + 1)}>{index + 1}</button>)}
    </div>
    <div className="ac-value" aria-live="polite"><span>{visual.name}</span><strong>{value}</strong>
      {comparing && <span>{value >= threshold ? 'True · bloco if' : 'False · bloco else'}</span>}</div>
    <div className="ac-actions"><button className="ac-btn" onClick={() => setStep(step + 1)} disabled={step === end}>Avançar <StepForward size={15} aria-hidden="true" /></button>
      <button className="ac-btn ac-subtle" onClick={() => setStep(0)} disabled={step === 0}><RotateCcw size={15} aria-hidden="true" /> Reiniciar</button></div>
  </section>
}
