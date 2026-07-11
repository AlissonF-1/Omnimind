'use client'

import { BookOpen, AlertTriangle, X, Clock } from 'lucide-react'
import Link from 'next/link'
import { useState, useEffect, useRef, useCallback } from 'react'

interface RelearningAlertProps {
  noteId: string
  workspaceId: string
  lapsedPercentage: number
  cardsWithLapses: number
  totalCards: number
  /** Se true, o alerta pode ser descartado permanentemente (usando localStorage). Padrão: false */
  persistentDismiss?: boolean
  /** Tempo em segundos para exibição automática (0 = nunca). Padrão: 0 */
  autoDismissSeconds?: number
  /** Callback opcional quando o alerta for descartado */
  onDismiss?: () => void
}

export default function RelearningAlert({
  noteId,
  workspaceId,
  lapsedPercentage,
  cardsWithLapses,
  totalCards,
  persistentDismiss = false,
  autoDismissSeconds = 0,
  onDismiss,
}: RelearningAlertProps) {
  const storageKey = `relearning-alert-${workspaceId}-${noteId}`
  const [isDismissed, setIsDismissed] = useState(false)
  const [isExiting, setIsExiting] = useState(false)
  const [remainingSeconds, setRemainingSeconds] = useState(autoDismissSeconds)
  const touchStartX = useRef<number | null>(null)
  const touchDeltaX = useRef<number>(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Restaura estado do storage
  useEffect(() => {
    const storage = persistentDismiss ? localStorage : sessionStorage
    const dismissed = storage.getItem(storageKey) === 'true'
    setIsDismissed(dismissed)
  }, [storageKey, persistentDismiss])

  // Auto-dismiss com contagem regressiva
  useEffect(() => {
    if (autoDismissSeconds > 0 && !isDismissed && !isExiting) {
      setRemainingSeconds(autoDismissSeconds)
      timerRef.current = setInterval(() => {
        setRemainingSeconds(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!)
            handleDismiss()
            return 0
          }
          return prev - 1
        })
      }, 1000)

      return () => {
        if (timerRef.current) clearInterval(timerRef.current)
      }
    }
  }, [autoDismissSeconds, isDismissed, isExiting])

  const handleDismiss = useCallback(() => {
    setIsExiting(true)
    // Pequena vibração se suportado
    if (navigator.vibrate) navigator.vibrate(10)
    // Espera a animação terminar
    setTimeout(() => {
      const storage = persistentDismiss ? localStorage : sessionStorage
      storage.setItem(storageKey, 'true')
      setIsDismissed(true)
      onDismiss?.()
      if (timerRef.current) clearInterval(timerRef.current)
    }, 300)
  }, [persistentDismiss, storageKey, onDismiss])

  // Handlers de swipe (toque)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchDeltaX.current = 0
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const deltaX = e.touches[0].clientX - touchStartX.current
    touchDeltaX.current = deltaX
    if (containerRef.current) {
      const translateX = Math.min(0, deltaX) // apenas arraste para a esquerda
      containerRef.current.style.transform = `translateX(${translateX}px)`
      containerRef.current.style.opacity = `${1 - Math.min(1, Math.abs(deltaX) / 200)}`
    }
  }

  const handleTouchEnd = () => {
    if (touchDeltaX.current < -80) {
      // Arrastou para a esquerda o suficiente
      handleDismiss()
    } else {
      // Reverte
      if (containerRef.current) {
        containerRef.current.style.transform = 'translateX(0)'
        containerRef.current.style.opacity = '1'
      }
    }
    touchStartX.current = null
    touchDeltaX.current = 0
  }

  // Se descartado, não renderiza
  if (isDismissed) return null

  const alertMessage =
    cardsWithLapses === totalCards
      ? `Todos os ${totalCards} cards (${lapsedPercentage}%) sofreram lapso recentemente.`
      : `${cardsWithLapses} de ${totalCards} cards (${lapsedPercentage}%) sofreram lapso recentemente.`

  return (
    <div
      ref={containerRef}
      className="relative mb-4 flex items-start gap-3 rounded-lg border border-warning-soft bg-warning-muted/30 p-4 shadow-sm transition-all duration-300 will-change-transform"
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ transform: 'translateX(0)', opacity: 1 }}
    >
      {/* Indicador de swipe (opcional, apenas mobile) */}
      <div className="absolute -left-1 top-1/2 -translate-y-1/2 hidden sm:block">
        <div className="h-8 w-1 rounded-full bg-warning/20 animate-pulse" />
      </div>

      <div className="mt-0.5 shrink-0">
        <AlertTriangle className="size-5 text-warning animate-pulse" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-warning-strong flex items-center gap-2 flex-wrap">
          <span>⚠️ Alerta de Reaprendizagem</span>
          {autoDismissSeconds > 0 && remainingSeconds > 0 && (
            <span className="text-xs font-normal text-text-muted inline-flex items-center gap-1 bg-surface-elevated/50 px-2 py-0.5 rounded-full">
              <Clock className="size-3" />
              {remainingSeconds}s
            </span>
          )}
        </p>

        <p className="mt-1 text-sm text-text-medium leading-relaxed">
          {alertMessage}
          <span className="block mt-1 text-xs text-text-muted">
            Considere reler a nota para reforçar o aprendizado.
          </span>
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/dashboard/${workspaceId}/note/${noteId}`}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-warning hover:bg-warning-strong text-white px-4 py-2 text-sm font-medium transition-colors shadow-sm hover:shadow focus:outline-none focus:ring-2 focus:ring-warning-soft focus:ring-offset-2 active:scale-95"
          >
            <BookOpen className="size-4" />
            Reler Nota
          </Link>

          <button
            onClick={handleDismiss}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-warning-soft hover:bg-warning-soft/50 px-4 py-2 text-sm font-medium transition-colors text-text-medium hover:text-text-strong focus:outline-none focus:ring-2 focus:ring-warning-soft focus:ring-offset-2 active:scale-95"
            aria-label="Descartar alerta"
          >
            Descartar
          </button>
        </div>

        {/* Dica de swipe (mobile) */}
        <p className="mt-2 text-[10px] text-text-muted block sm:hidden">
          ← Deslize para descartar
        </p>
      </div>

      <button
        onClick={handleDismiss}
        className="shrink-0 rounded hover:bg-warning-soft p-1 text-text-medium hover:text-text-strong transition-colors focus:outline-none focus:ring-2 focus:ring-warning-soft active:scale-90"
        aria-label="Fechar alerta"
      >
        <X className="size-4" />
      </button>

      {/* Barra de progresso do auto-dismiss (visual) */}
      {autoDismissSeconds > 0 && remainingSeconds > 0 && (
        <div className="absolute bottom-0 left-0 h-0.5 bg-warning/30 rounded-b-lg overflow-hidden w-full">
          <div
            className="h-full bg-warning transition-all duration-1000 ease-linear"
            style={{
              width: `${(remainingSeconds / autoDismissSeconds) * 100}%`,
            }}
          />
        </div>
      )}
    </div>
  )
}