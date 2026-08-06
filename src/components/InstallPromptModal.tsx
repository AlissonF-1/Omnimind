'use client'

import React, { useState, useEffect } from 'react'
import { Download, X, Smartphone, Sparkles, Check } from 'lucide-react'

export default function InstallPromptModal() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showPrompt, setShowPrompt] = useState<boolean>(false)
  const [isInstalled, setIsInstalled] = useState<boolean>(false)

  useEffect(() => {
    // Verifica se já está rodando como PWA (standalone)
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    ) {
      setIsInstalled(true)
      return
    }

    // Verifica se o usuário já dispensou nos últimos 7 dias
    const dismissedUntil = localStorage.getItem('omnimind_pwa_dismissed_until')
    if (dismissedUntil && Date.now() < parseInt(dismissedUntil, 10)) {
      return
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowPrompt(true)
    }

    const handleAppInstalled = () => {
      setIsInstalled(true)
      setShowPrompt(false)
      setDeferredPrompt(null)
      localStorage.removeItem('omnimind_pwa_dismissed_until')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return

    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') {
      setShowPrompt(false)
    }
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    // Silencia o prompt por 7 dias
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000
    localStorage.setItem('omnimind_pwa_dismissed_until', (Date.now() + sevenDaysInMs).toString())
  }

  if (!showPrompt || isInstalled) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 animate-in slide-in-from-bottom-6 duration-500">
      <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-surface-dark/95 via-surface/95 to-primary-soft/40 p-4 sm:p-5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md">
        {/* Glow sutil */}
        <div className="absolute -top-12 -right-12 size-28 rounded-full bg-primary/20 blur-2xl pointer-events-none" />

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative size-11 shrink-0 rounded-xl bg-gradient-to-br from-primary to-indigo-600 p-0.5 shadow-md flex items-center justify-center text-white">
              <Smartphone className="size-6 text-white" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-text-strong flex items-center gap-1.5">
                Instale o OmniMind
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-primary/20 text-primary text-[10px] font-semibold">
                  <Sparkles className="size-3" /> PWA
                </span>
              </h4>
              <p className="text-xs text-text-medium mt-0.5">
                Acesse direto da tela inicial e revise seus flashcards mesmo offline.
              </p>
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="text-text-muted hover:text-text-strong p-1 rounded-lg hover:bg-surface-muted transition-colors"
            title="Dispensar"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 justify-end">
          <button
            onClick={handleDismiss}
            className="px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text-strong transition-colors"
          >
            Agora não
          </button>
          <button
            onClick={handleInstallClick}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold transition-all shadow-md active:scale-95"
          >
            <Download className="size-3.5" />
            Instalar App
          </button>
        </div>
      </div>
    </div>
  )
}
