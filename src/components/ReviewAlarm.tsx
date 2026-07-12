'use client'

import { useState, useEffect } from 'react'
import { Bell, BellOff, Loader2, Sparkles } from 'lucide-react'

// Helper para converter a chave pública VAPID
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export default function ReviewAlarm() {
  const [supported, setSupported] = useState(true)
  const [isEnabled, setIsEnabled] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [statusMessage, setStatusMessage] = useState('')

  useEffect(() => {
    async function checkSubscription() {
      if (
        typeof window !== 'undefined' &&
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window
      ) {
        try {
          // Verifica em todas as assinaturas registradas
          const registrations = await navigator.serviceWorker.getRegistrations()
          let hasActiveSub = false
          for (const reg of registrations) {
            const sub = await reg.pushManager.getSubscription()
            if (sub) {
              hasActiveSub = true
              break
            }
          }
          setIsEnabled(hasActiveSub)
        } catch (err) {
          console.error('Erro ao verificar inscrição de push:', err)
        }
      } else {
        setSupported(false)
      }
      setIsLoading(false)
    }

    checkSubscription()
  }, [])

  const handleToggle = async () => {
    if (!supported || isLoading) return

    setIsLoading(true)
    setStatusMessage('')

    try {
      if (isEnabled) {
        // 🔴 Desativar Notificações
        const registrations = await navigator.serviceWorker.getRegistrations()
        for (const reg of registrations) {
          const sub = await reg.pushManager.getSubscription()
          if (sub) {
            await sub.unsubscribe()
          }
        }
        setIsEnabled(false)
        setStatusMessage('Alarmes desativados no navegador.')
      } else {
        // 🟢 Ativar Notificações
        // 1. Solicita permissão
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          throw new Error('Permissão de notificações recusada pelo usuário.')
        }

        // 2. Registra o Service Worker de forma robusta e imediata
        let registration = await navigator.serviceWorker.getRegistration()
        if (!registration) {
          registration = await navigator.serviceWorker.register('/sw-custom.js', {
            scope: '/'
          })
          await navigator.serviceWorker.ready
        }

        // 3. Inscreve no Push Manager
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!vapidPublicKey) {
          throw new Error('Chave VAPID pública não está configurada nas variáveis de ambiente (.env.local).')
        }

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
        })

        // 4. Envia para o backend salvar no Supabase
        const res = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription })
        })

        if (!res.ok) {
          const errData = await res.json()
          throw new Error(errData.error || 'Falha ao salvar inscrição no servidor.')
        }

        setIsEnabled(true)
        setStatusMessage('Alarme ativado com sucesso! 🔥')
      }
    } catch (err: any) {
      console.error(err)
      setStatusMessage(err.message || 'Ocorreu um erro ao configurar o alarme.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!supported) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-surface-muted/50 text-xs text-text-muted">
        <BellOff className="size-4 shrink-0 text-text-muted" />
        <span>Notificações Push não suportadas pelo seu navegador ou dispositivo.</span>
      </div>
    )
  }

  return (
    <div className="relative group overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-sm transition-all hover:shadow-md">
      {/* Glow decorativo se ativo */}
      {isEnabled && (
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 opacity-100 transition-opacity duration-300 pointer-events-none" />
      )}

      <div className="flex items-start justify-between gap-4 z-10 relative">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl transition-colors ${isEnabled ? 'bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/25' : 'bg-surface-muted text-text-muted'}`}>
            {isEnabled ? <Bell className="size-5 animate-swing" /> : <BellOff className="size-5" />}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-sm text-text-strong">Alarme de Revisão</h3>
              {isEnabled && (
                <span className="flex items-center gap-0.5 text-[9px] bg-emerald-500/10 text-emerald-500 font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full">
                  <Sparkles className="size-2" /> Ativo
                </span>
              )}
            </div>
            <p className="text-xs text-text-muted mt-0.5 leading-snug">
              {isEnabled 
                ? 'Você será alertado quando cards estiverem para vencer.' 
                : 'Receba alertas de urgência direto no seu dispositivo.'}
            </p>
          </div>
        </div>

        {/* Toggle Switch */}
        <button
          onClick={handleToggle}
          disabled={isLoading}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${isEnabled ? 'bg-emerald-500' : 'bg-slate-700'} disabled:opacity-50`}
        >
          <span
            className={`pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${isEnabled ? 'translate-x-5' : 'translate-x-0'}`}
          />
        </button>
      </div>

      {isLoading && (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-text-muted animate-pulse">
          <Loader2 className="size-3 animate-spin text-primary" />
          <span>Configurando serviço...</span>
        </div>
      )}

      {statusMessage && !isLoading && (
        <div className={`mt-3 text-[11px] font-medium ${isEnabled ? 'text-emerald-500' : 'text-amber-500'}`}>
          {statusMessage}
        </div>
      )}
    </div>
  )
}
