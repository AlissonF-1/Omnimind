'use client'

import { useEffect, useRef, useState } from 'react'
import AchievementNotifier from '@/components/AchievementNotifier'
import type { AchievementDetails } from '@/types/achievements'

export default function DashboardAchievements({ checkAction }: {
  checkAction: () => Promise<AchievementDetails[]>
}) {
  const pending = useRef<Promise<AchievementDetails[]> | null>(null)
  const [unlocked, setUnlocked] = useState<AchievementDetails[]>([])

  useEffect(() => {
    let active = true
    pending.current ??= checkAction()
    pending.current.then((achievements) => {
      if (active) setUnlocked(achievements)
    }).catch((error: unknown) => {
      console.error('[dashboard] Falha ao verificar conquistas:', error instanceof Error ? error.name : typeof error)
    })
    return () => { active = false }
  }, [checkAction])

  return <AchievementNotifier newlyUnlocked={unlocked} />
}
