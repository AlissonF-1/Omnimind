'use client'

import { Sunrise, Sun, Moon, Sparkles, BrainCircuit } from 'lucide-react'

interface StudyInsightsPanelProps {
  logs: any[]
  aiReport: string
}

export default function StudyInsightsPanel({ logs, aiReport }: StudyInsightsPanelProps) {
  // 1. Agregação de estatísticas horárias dos últimos logs
  const totalPerHour = Array(24).fill(0)
  const correctPerHour = Array(24).fill(0)

  if (Array.isArray(logs)) {
    logs.forEach((log) => {
      const hr = log.hourly_reviews
      const hc = log.hourly_correct
      if (Array.isArray(hr)) {
        for (let i = 0; i < 24; i++) {
          totalPerHour[i] += Number(hr[i] || 0)
        }
      }
      if (Array.isArray(hc)) {
        for (let i = 0; i < 24; i++) {
          correctPerHour[i] += Number(hc[i] || 0)
        }
      }
    })
  }

  // 2. Agrupamento por períodos do dia
  // Manhã: 5h às 12h (índices 5 a 11)
  // Tarde: 12h às 18h (índices 12 a 17)
  // Noite: 18h às 5h (índices 18 a 23 e 0 a 4)
  const periods = [
    {
      name: 'Manhã',
      timeRange: '05:00 - 12:00',
      icon: Sunrise,
      colorClass: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
      barColor: 'from-amber-500 to-orange-400',
      total: 0,
      correct: 0,
    },
    {
      name: 'Tarde',
      timeRange: '12:00 - 18:00',
      icon: Sun,
      colorClass: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
      barColor: 'from-sky-400 to-indigo-400',
      total: 0,
      correct: 0,
    },
    {
      name: 'Noite',
      timeRange: '18:00 - 05:00',
      icon: Moon,
      colorClass: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
      barColor: 'from-purple-400 to-pink-500',
      total: 0,
      correct: 0,
    },
  ]

  for (let i = 0; i < 24; i++) {
    if (i >= 5 && i < 12) {
      periods[0].total += totalPerHour[i]
      periods[0].correct += correctPerHour[i]
    } else if (i >= 12 && i < 18) {
      periods[1].total += totalPerHour[i]
      periods[1].correct += correctPerHour[i]
    } else {
      periods[2].total += totalPerHour[i]
      periods[2].correct += correctPerHour[i]
    }
  }

  return (
    <section className="space-y-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        Insights do Cérebro 🧠
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Painel do Horário de Ouro */}
        <div className="panel-muted rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <BrainCircuit className="size-5 text-primary" />
              <h4 className="text-sm font-bold text-text-strong">Horário de Ouro (Rendimento)</h4>
            </div>

            <div className="space-y-4">
              {periods.map((p) => {
                const accuracy = p.total > 0 ? Math.round((p.correct / p.total) * 100) : null
                const Icon = p.icon
                
                // Feedback verbal de acordo com a taxa de acerto
                let feedback = 'Sem dados de revisões neste período.'
                if (accuracy !== null) {
                  if (accuracy >= 80) feedback = `${accuracy}% de acertos — Excelente rendimento!`
                  else if (accuracy >= 60) feedback = `${accuracy}% de acertos — Foco razoável.`
                  else feedback = `${accuracy}% de acertos — Atenção/cansaço detectado.`
                }

                return (
                  <div key={p.name} className="bg-surface/40 border border-border/30 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className={`flex size-8 items-center justify-center rounded-lg border ${p.colorClass}`}>
                          <Icon className="size-4.5" />
                        </span>
                        <div>
                          <p className="text-xs font-semibold text-text-strong">{p.name}</p>
                          <p className="text-[10px] text-text-muted">{p.timeRange}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-text-muted">Revisões Totais</p>
                        <p className="text-xs font-bold text-text-strong tabular-nums">{p.total}</p>
                      </div>
                    </div>

                    {accuracy !== null ? (
                      <div className="space-y-1.5 pt-1">
                        <div className="h-1.5 w-full bg-surface-muted rounded-full overflow-hidden">
                          <div 
                            className={`h-full bg-gradient-to-r ${p.barColor} transition-all duration-500`}
                            style={{ width: `${accuracy}%` }}
                          />
                        </div>
                        <p className="text-[10px] font-medium text-text-medium flex items-center justify-between">
                          <span>{feedback}</span>
                          <span className="font-bold text-text-strong">{accuracy}%</span>
                        </p>
                      </div>
                    ) : (
                      <p className="text-[10px] font-normal text-text-muted italic pt-1">
                        {feedback}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <p className="text-[9px] text-text-muted mt-4 italic">
            * O gráfico compila os logs de suas respostas e calcula o aproveitamento real das revisões agendadas.
          </p>
        </div>

        {/* Painel do Ciclo de Aprendizado (IA) */}
        <div className="panel-muted rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="size-5 text-primary" />
              <h4 className="text-sm font-bold text-text-strong">Ciclo de Aprendizado Semanal</h4>
            </div>

            <div className="text-xs leading-relaxed text-text-medium space-y-3 prose prose-invert max-w-none">
              {aiReport.split('\n\n').map((para, idx) => (
                <p key={idx} className="bg-surface/20 border border-border/20 rounded-xl p-3">
                  {para.replace(/\*\*/g, '').trim()}
                </p>
              ))}
            </div>
          </div>
          
          <p className="text-[9px] text-text-muted mt-4 italic">
            * O tutor de IA analisa a estabilidade e os lapsos do FSRS para traçar o diagnóstico de retenção.
          </p>
        </div>

      </div>
    </section>
  )
}
