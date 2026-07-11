'use client'

import { useState, useEffect, useCallback } from 'react'
import { toggleSprintMode } from '@/actions/workspaces'
import { Flame, Calendar, Loader2, AlertTriangle, CheckCircle } from 'lucide-react'

interface SprintControlProps {
  workspaceId: string
  isSprintMode: boolean
  sprintDate: string | null
}

export default function SprintControl({ workspaceId, isSprintMode, sprintDate }: SprintControlProps) {
  const [isActive, setIsActive] = useState(isSprintMode)
  const [date, setDate] = useState(sprintDate ? sprintDate.split('T')[0] : '')
  const [isLoading, setIsLoading] = useState(false)
  const [showConfirmDeactivate, setShowConfirmDeactivate] = useState(false)
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null)

  // Calcula dias restantes quando ativo
  useEffect(() => {
    if (isActive && date) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const target = new Date(date + 'T00:00:00')
      const diff = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      setDaysRemaining(diff >= 0 ? diff : 0)
    } else {
      setDaysRemaining(null)
    }
  }, [isActive, date])

  const handleToggle = async () => {
    // Se for desativar, perguntar confirmação
    if (isActive) {
      if (!showConfirmDeactivate) {
        setShowConfirmDeactivate(true)
        return
      }
      setShowConfirmDeactivate(false)
    } else {
      // Ativando: validar data
      if (!date) {
        alert('Por favor, selecione a data da prova antes de ativar o Modo Sprint.')
        return
      }
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const target = new Date(date + 'T00:00:00')
      if (target < today) {
        alert('A data da prova deve ser no futuro.')
        return
      }
    }

    setIsLoading(true)
    const newStatus = !isActive
    try {
      await toggleSprintMode(workspaceId, newStatus, newStatus ? new Date(date).toISOString() : null)
      setIsActive(newStatus)
      if (!newStatus) {
        setShowConfirmDeactivate(false)
        setDaysRemaining(null)
      }
    } catch (error) {
      console.error(error)
      alert('Erro ao atualizar o Modo Sprint.')
    } finally {
      setIsLoading(false)
    }
  }

  const cancelDeactivate = () => setShowConfirmDeactivate(false)

  // Formatação da data para exibição
  const formattedDate = date ? new Date(date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''

  return (
    <div
      className={`relative flex flex-col sm:flex-row sm:items-center gap-4 panel p-4 transition-all duration-300 ${
        isActive ? 'border-primary/40 bg-primary-soft/20 shadow-[0_0_15px_rgba(99,102,241,0.1)]' : ''
      }`}
      role="region"
      aria-label="Controle do Modo Sprint"
    >
      {isActive && daysRemaining !== null && daysRemaining <= 3 && (
        <div className="absolute -top-2 -right-2 flex items-center gap-1 rounded-full bg-error-soft px-2 py-0.5 text-[10px] font-bold text-error animate-pulse">
          <AlertTriangle className="size-3" />
          {daysRemaining === 0 ? 'HOJE!' : `${daysRemaining}d`}
        </div>
      )}

      <div className="flex items-center gap-3">
        <div
          className={`p-2 rounded-xl transition-all duration-300 ${
            isActive ? 'bg-primary-soft text-primary shadow-sm' : 'bg-surface-muted text-text-muted'
          }`}
        >
          <Flame className={`size-5 ${isActive ? 'animate-pulse' : ''}`} />
        </div>
        <div>
          <h3 className="text-text-strong font-medium text-sm flex items-center gap-2">
            Modo Sprint
            {isActive && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-soft/50 px-2 py-0.5 text-[10px] font-semibold text-success">
                <CheckCircle className="size-3" />
                Ativo
              </span>
            )}
          </h3>
          <p className="text-xs text-text-muted">
            {isActive && daysRemaining !== null
              ? daysRemaining === 0
                ? '🚨 Prova é hoje! Revisão urgente.'
                : `📅 ${daysRemaining} dia${daysRemaining > 1 ? 's' : ''} restante${daysRemaining > 1 ? 's' : ''} para a prova`
              : 'Forçar revisão diária até a data da prova'}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:ml-auto w-full sm:w-auto">
        <div className="relative flex-1 sm:flex-none">
          <Calendar className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={isActive || isLoading}
            className="field pl-9 w-full sm:w-auto"
            aria-label="Data da prova"
            min={new Date().toISOString().split('T')[0]}
          />
        </div>

        {showConfirmDeactivate && isActive ? (
          <div className="flex items-center gap-2 w-full sm:w-auto animate-in fade-in slide-in-from-top-2 duration-200">
            <span className="text-xs text-text-medium">Desativar?</span>
            <button
              onClick={handleToggle}
              disabled={isLoading}
              className="btn-ghost text-error text-sm px-3 py-1.5 border border-error/30 hover:bg-error-soft/20"
            >
              Confirmar
            </button>
            <button
              onClick={cancelDeactivate}
              className="btn-ghost text-sm px-3 py-1.5"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={handleToggle}
            disabled={isLoading || (isActive ? false : !date)}
            className={`
              relative w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 
              active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed
              ${isActive 
                ? 'btn-secondary text-primary border-primary/30 hover:bg-primary-soft/30' 
                : 'bg-primary text-white hover:bg-primary/95 shadow-sm hover:shadow'
              }
            `}
          >
            {isLoading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                {isActive ? 'Desativar' : 'Ativar Sprint'}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}