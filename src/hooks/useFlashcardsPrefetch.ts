'use client'

import { useEffect } from 'react'
import { getDueFlashcards } from '@/actions/reviews'
import { saveCardsToCache } from '@/utils/offlineStore'

const lastPrefetchTime = new Map<string, number>()
const PREFETCH_INTERVAL = 5 * 60 * 1000 // 5 minutos

export function useFlashcardsPrefetch(accountId: string | null) {
  useEffect(() => {
    if (!accountId || typeof window === 'undefined' || !navigator.onLine) return

    const now = Date.now()
    if (now - (lastPrefetchTime.get(accountId) ?? 0) < PREFETCH_INTERVAL) return

    async function prefetch(owner: string) {
      try {
        const cards = await getDueFlashcards()
        if (cards && Array.isArray(cards) && cards.length > 0) {
          await saveCardsToCache(owner, cards)
          lastPrefetchTime.set(owner, Date.now())
        }
      } catch (err) {
        console.warn('[useFlashcardsPrefetch] Falha no prefetch em background:', err)
      }
    }

    prefetch(accountId)
  }, [accountId])
}
