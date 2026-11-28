'use client'

import { useState, useSyncExternalStore } from 'react'
import { AlertTriangle, ArrowRight, Flame } from '@/components/icons'
import Link from 'next/link'

interface DashboardRelearningAlertProps {
  topAlert?: {
    workspaceId: string
    workspaceName: string
    criticalCount: number
  }
}

function subscribeToDismissal(notify: () => void) {
  window.addEventListener('storage', notify)
  return () => window.removeEventListener('storage', notify)
}

export default function DashboardRelearningAlert({ topAlert }: DashboardRelearningAlertProps) {
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)
  const storageKey = topAlert ? 'dismissed_relearning_' + topAlert.workspaceId : null
  const isDismissed = useSyncExternalStore(subscribeToDismissal, () => {
    if (!storageKey) return true
    try {
      return sessionStorage.getItem(storageKey) !== null
    } catch {
      return false
    }
  }, () => true)

  if (!topAlert || !topAlert.criticalCount || !storageKey || isDismissed || dismissedKey === storageKey) return null

  const isSevere = topAlert.criticalCount >= 20
  const Icon = isSevere ? Flame : AlertTriangle

  function dismiss(key: string) {
    setDismissedKey(key)
    try {
      sessionStorage.setItem(key, new Date().toISOString())
    } catch {
      // Ainda descarta o alerta nesta tela quando o armazenamento é bloqueado.
    }
  }

  return (
    <aside className="dh-panel dh-pad dh-alert" aria-label="Alerta de revisão">
      <div className="dh-row min-w-0">
        <span className={'dh-icon ' + (isSevere ? 'dh-danger' : 'dh-warning')}><Icon size={17} aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 className="dh-title">{isSevere ? 'Risco crítico de esquecimento' : 'Risco de esquecimento'}</h2>
          <p className="dh-caption">{topAlert.criticalCount} cards com lapsos recorrentes em <strong>{topAlert.workspaceName}</strong>.</p>
        </div>
      </div>
      <div className="dh-row">
        <button type="button" onClick={() => dismiss(storageKey)} className="dh-button">Descartar</button>
        <Link href={'/dashboard/revisoes?workspaceId=' + encodeURIComponent(topAlert.workspaceId)} className="dh-button">
          Revisar workspace <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </aside>
  )
}
