'use client'

import { useState, useEffect } from 'react'
import { Bell, BellOff, MoonStar } from '@/components/icons'
import { useSettings } from '@/contexts/SettingsContext'

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
  const { settings } = useSettings()
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
            await fetch('/api/push/unsubscribe', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ endpoint: sub.endpoint })
            }).catch(console.error)
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
    } catch (err) {
      console.error(err)
      setStatusMessage(err instanceof Error ? err.message : 'Ocorreu um erro ao configurar o alarme.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleTestNotification = async () => {
    try {
      setIsLoading(true)
      setStatusMessage('')

      // 1. Tenta enviar via Service Worker nativo para simular o Push Real do SO
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration()
        if (reg && 'showNotification' in reg) {
          await reg.showNotification('🔥 Alarme de Revisão OmniMind (Teste)', {
            body: 'Seu alarme está ativo e funcionando no seu sistema! 🎯',
            icon: '/icon-transparent-192.png?v=2',
            badge: '/notification-badge.png?v=2',
            tag: 'test-notification'
          })
          setStatusMessage('Disparada! Verifique a central de notificações do seu computador/celular. 🚀')
          setIsLoading(false)
          return
        }
      }

      // 2. Fallback para Notification API padrão
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('🔥 Alarme de Revisão OmniMind (Teste)', {
          body: 'Seu alarme está ativo e funcionando no seu sistema! 🎯',
          icon: '/icon-transparent-192.png?v=2'
        })
        setStatusMessage('Disparada! Verifique as notificações do seu sistema. 🚀')
      } else {
        setStatusMessage('Permissão de notificação ainda não concedida no navegador.')
      }
    } catch (err) {
      console.error('Erro ao testar notificação:', err)
      setStatusMessage(err instanceof Error ? err.message : 'Não foi possível enviar o lembrete de teste.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!supported || settings.do_not_disturb) {
    const Icon = supported ? MoonStar : BellOff
    return (
      <section className="st-row st-alarm" aria-labelledby="settings-alarm-title">
        <div>
          <h3 id="settings-alarm-title"><Icon size={17} aria-hidden="true" /> Alarme de revisão</h3>
          <p>{supported ? 'Lembretes pausados pelo modo Não perturbe.' : 'Notificações indisponíveis neste navegador.'}</p>
        </div>
      </section>
    )
  }

  const Icon = isEnabled ? Bell : BellOff
  return (
    <section className="st-row st-alarm" aria-labelledby="settings-alarm-title">
      <div>
        <h3 id="settings-alarm-title"><Icon size={17} aria-hidden="true" /> Alarme de revisão</h3>
        <p id="settings-alarm-info">{isEnabled ? 'Notificações ativadas neste navegador.' : 'Receba lembretes de revisão neste dispositivo.'}</p>
      </div>
      <button type="button" role="switch" className="st-switch-button" aria-checked={isEnabled}
        aria-labelledby="settings-alarm-title" aria-describedby="settings-alarm-info" onClick={handleToggle} disabled={isLoading}
      >
        <span aria-hidden="true" />
      </button>
      {isEnabled && !isLoading && (
        <div className="st-alarm-actions">
          <button type="button" className="st-button" onClick={handleTestNotification}>Testar notificação</button>
        </div>
      )}
      {isLoading && <p role="status" className="st-alarm-feedback">Verificando notificações…</p>}
      {statusMessage && !isLoading && <p role="status" className="st-alarm-feedback">{statusMessage}</p>}
    </section>
  )
}
