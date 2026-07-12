'use client'

import { useState, useEffect } from 'react'
import { Trophy } from 'lucide-react'
import { playTrophySound } from '@/utils/audio'
import { useSettings } from '@/contexts/SettingsContext'

interface AchievementData {
  id: string
  title: string
  description: string
}

export default function AchievementToast() {
  const [current, setCurrent] = useState<AchievementData | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const { settings } = useSettings()

  useEffect(() => {
    const handleUnlock = (e: Event) => {
      const customEvent = e as CustomEvent<AchievementData>
      if (!customEvent.detail) return

      // Toca o efeito de duplo carrilhão do console, caso ativado
      if (settings.enable_sounds) {
        playTrophySound()
      }

      // Exibe a conquista
      setCurrent(customEvent.detail)
      setIsVisible(true)

      // Retrai o popup após 4.5 segundos
      const timerHide = setTimeout(() => {
        setIsVisible(false)
        const timerClear = setTimeout(() => setCurrent(null), 300)
        return () => clearTimeout(timerClear)
      }, 4500)

      return () => clearTimeout(timerHide)
    }

    window.addEventListener('achievement-unlocked', handleUnlock)
    return () => window.removeEventListener('achievement-unlocked', handleUnlock)
  }, [settings.enable_sounds])

  if (!current) return null

  return (
    <div 
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-slate-900/90 border border-amber-500/30 text-white rounded-full px-6 py-3 shadow-[0_0_24px_rgba(245,158,11,0.2)] backdrop-blur-md transition-all duration-300 ease-out select-none ${
        isVisible 
          ? 'translate-y-0 opacity-100 scale-100' 
          : 'translate-y-12 opacity-0 scale-95 pointer-events-none'
      }`}
    >
      {/* Troféu dourado vibrante com circulo de luz */}
      <div className="flex size-9 items-center justify-center rounded-full bg-amber-500/25 text-amber-400 ring-2 ring-amber-500/50 animate-pulse shrink-0">
        <Trophy className="size-5" />
      </div>

      <div className="min-w-0 pr-2">
        <span className="block text-[10px] font-extrabold text-amber-400 uppercase tracking-widest leading-none mb-1">
          Conquista Desbloqueada
        </span>
        <h4 className="font-extrabold text-sm text-slate-100 tracking-wide truncate leading-tight">
          {current.title}
        </h4>
        <p className="text-[11px] text-slate-400 leading-tight truncate mt-0.5">
          {current.description}
        </p>
      </div>
    </div>
  )
}
