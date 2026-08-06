'use client'

import React from 'react'
import { WifiOff, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'

interface OfflineBannerProps {
  isOnline: boolean
  pendingCount: number
  isSyncing: boolean
  syncStatusMessage: string | null
  onManualSync?: () => void
}

export default function OfflineBanner({
  isOnline,
  pendingCount,
  isSyncing,
  syncStatusMessage,
  onManualSync,
}: OfflineBannerProps) {
  if (isOnline && pendingCount === 0 && !syncStatusMessage && !isSyncing) {
    return null
  }

  return (
    <div className="w-full mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
      {!isOnline && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs sm:text-sm font-medium shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <WifiOff className="size-4 shrink-0 text-amber-400 animate-pulse" />
            <span className="truncate">
              <strong>Modo Offline:</strong> Suas revisões estão sendo salvas no dispositivo.
            </span>
          </div>
          {pendingCount > 0 && (
            <span className="shrink-0 font-bold bg-amber-500/20 text-amber-200 px-2 py-0.5 rounded-full text-[11px] border border-amber-500/30">
              {pendingCount} pendente{pendingCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {isOnline && isSyncing && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-primary/30 bg-primary/10 text-primary-light text-xs sm:text-sm font-medium shadow-sm">
          <RefreshCw className="size-4 shrink-0 animate-spin text-primary" />
          <span>{syncStatusMessage || 'Sincronizando suas revisões salvas offline...'}</span>
        </div>
      )}

      {isOnline && !isSyncing && syncStatusMessage && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs sm:text-sm font-medium shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
            <span className="truncate">{syncStatusMessage}</span>
          </div>
        </div>
      )}

      {isOnline && !isSyncing && pendingCount > 0 && !syncStatusMessage && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs sm:text-sm font-medium shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertCircle className="size-4 shrink-0 text-amber-400" />
            <span>Você tem <strong>{pendingCount}</strong> revisão(ões) salva(s) offline aguardando sincronização.</span>
          </div>
          {onManualSync && (
            <button
              onClick={onManualSync}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-semibold transition-colors border border-amber-500/30 active:scale-95"
            >
              <RefreshCw className="size-3" />
              Sincronizar agora
            </button>
          )}
        </div>
      )}
    </div>
  )
}
