'use client'

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react'
import { getPendingReviews, removePendingReview } from '@/utils/offlineStore'
import { submitReview } from '@/actions/reviews'
import type { Rating } from 'ts-fsrs'

function subscribeToConnection(change: () => void) {
  window.addEventListener('online', change)
  window.addEventListener('offline', change)
  return () => {
    window.removeEventListener('online', change)
    window.removeEventListener('offline', change)
  }
}

export function useOfflineSync(accountId: string) {
  const isOnline = useSyncExternalStore(subscribeToConnection, () => navigator.onLine, () => true)
  const [pendingCount, setPendingCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null)
  const syncing = useRef(false)

  const refreshPendingCount = useCallback(async () => {
    const pending = await getPendingReviews(accountId)
    setPendingCount(pending.length)
  }, [accountId])

  const syncPendingReviews = useCallback(async () => {
    if (syncing.current || !navigator.onLine) return
    syncing.current = true

    try {
      const pending = await getPendingReviews(accountId)
      if (!pending.length) {
        setPendingCount(0)
        return
      }

      setIsSyncing(true)
      setSyncStatusMessage('Sincronizando revisões feitas offline…')
      let successCount = 0
      for (const item of pending) {
        try {
          const response = await submitReview(item.cardId, item.currentFsrsState, item.grade as Rating)
          if (item.id !== undefined && response && !response.error) {
            await removePendingReview(accountId, item.id)
            successCount++
          }
        } catch {
          // Keep the owner's review pending on network or session failure.
        }
      }

      const remaining = await getPendingReviews(accountId)
      setPendingCount(remaining.length)
      setSyncStatusMessage(remaining.length
        ? 'Algumas revisões ainda estão pendentes.'
        : successCount + ' revisão(ões) sincronizada(s) com sucesso!')
    } finally {
      syncing.current = false
      setIsSyncing(false)
    }
  }, [accountId])

  useEffect(() => {
    void Promise.resolve().then(isOnline ? syncPendingReviews : refreshPendingCount)
  }, [isOnline, refreshPendingCount, syncPendingReviews])

  return { isOnline, pendingCount, isSyncing, syncStatusMessage, refreshPendingCount, syncPendingReviews }
}
