'use client'

import { useEffect } from 'react'

export default function PwaRegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw-custom.js')
        .then((reg) => {
          console.log('[OmniMind PWA] Service Worker ativo:', reg.scope)
        })
        .catch((err) => {
          console.warn('[OmniMind PWA] Erro ao registrar Service Worker:', err)
        })
    }
  }, [])

  return null
}
