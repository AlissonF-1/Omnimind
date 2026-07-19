'use client'

import { useEffect } from 'react'
import { AchievementDetails } from '@/types/achievements'

export default function AchievementNotifier({ newlyUnlocked }: { newlyUnlocked: AchievementDetails[] }) {
  useEffect(() => {
    if (!newlyUnlocked || newlyUnlocked.length === 0) return

    const timers = newlyUnlocked.map((achievement, index) => {
      // Enfileira os popups de conquista com delay de 5 segundos para evitar sobreposição
      return setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('achievement-unlocked', {
            detail: {
              id: achievement.id,
              title: achievement.title,
              description: achievement.description,
            },
          })
        )
      }, index * 5000)
    })

    return () => timers.forEach(clearTimeout)
  }, [newlyUnlocked])

  return null
}
