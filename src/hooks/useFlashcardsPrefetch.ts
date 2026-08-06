'use client'

import { useEffect } from 'react'
import { getDueFlashcards } from '@/actions/reviews'
import { saveCardsToCache } from '@/utils/offlineStore'

let lastPrefetchTime = 0
const PREFETCH_INTERVAL = 5 * 60 * 1000 // 5 minutos

export function useFlashcardsPrefetch() {
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.onLine) return

    const now = Date.now()
    if (now - lastPrefetchTime < PREFETCH_INTERVAL) return

    async function prefetch() {
      try {
        const cards = await getDueFlashcards()
        if (cards && Array.isArray(cards) && cards.length > 0) {
          await saveCardsToCache(cards)
          lastPrefetchTime = Date.now()
        }
      } catch (err) {
        console.warn('[useFlashcardsPrefetch] Falha no prefetch em background:', err)
      }
    }

    prefetch()
  }, [])
}
