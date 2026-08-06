'use client'

import { useState, useEffect, useCallback } from 'react'
import { getPendingReviews, removePendingReview, PendingReview } from '@/utils/offlineStore'
import { submitReview } from '@/actions/reviews'

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState<boolean>(true)
  const [pendingCount, setPendingCount] = useState<number>(0)
  const [isSyncing, setIsSyncing] = useState<boolean>(false)
  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null)

  // Atualiza quantidade de itens pendentes na fila
  const refreshPendingCount = useCallback(async () => {
    if (typeof window === 'undefined') return
    const pending = await getPendingReviews()
    setPendingCount(pending.length)
  }, [])

  // Função principal de sincronização da fila offline -> Supabase
  const syncPendingReviews = useCallback(async () => {
    if (isSyncing || typeof window === 'undefined' || !navigator.onLine) return

    const pending = await getPendingReviews()
    if (pending.length === 0) {
      setPendingCount(0)
      return
    }

    setIsSyncing(true)
    setSyncStatusMessage(`Sincronizando ${pending.length} revisão(ões) realizada(s) offline...`)

    let successCount = 0
    for (const item of pending) {
      try {
        const result = await submitReview(item.cardId, item.currentFsrsState, item.grade as any)
        if (result && !result.error) {
          if (item.id) {
            await removePendingReview(item.id)
            successCount++
          }
        } else {
          console.error('[useOfflineSync] Erro ao enviar revisão pendente:', result?.error)
          // Se for erro de validação ou card não encontrado, remove o item corrompido para não travar a fila em loop
          if (item.id && result?.error) {
            await removePendingReview(item.id)
          }
        }
      } catch (err) {
        console.error('[useOfflineSync] Exceção ao enviar item pendente:', err)
        if (item.id) {
          await removePendingReview(item.id)
        }
      }
    }

    const remaining = await getPendingReviews()
    setPendingCount(remaining.length)
    setIsSyncing(false)

    if (successCount > 0) {
      setSyncStatusMessage(`✅ ${successCount} revisão(ões) sincronizada(s) com sucesso!`)
      setTimeout(() => setSyncStatusMessage(null), 4000)
    } else if (remaining.length > 0) {
      setSyncStatusMessage(`⚠️ Não foi possível sincronizar todas as revisões. Tentaremos novamente em instantes.`)
      setTimeout(() => setSyncStatusMessage(null), 5000)
    }
  }, [isSyncing])

  useEffect(() => {
    if (typeof window === 'undefined') return

    setIsOnline(navigator.onLine)
    refreshPendingCount()

    const handleOnline = () => {
      setIsOnline(true)
      syncPendingReviews()
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Se inicializou já online e há pendências, tenta sincronizar
    if (navigator.onLine) {
      syncPendingReviews()
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [refreshPendingCount, syncPendingReviews])

  return {
    isOnline,
    pendingCount,
    isSyncing,
    syncStatusMessage,
    refreshPendingCount,
    syncPendingReviews,
  }
}
