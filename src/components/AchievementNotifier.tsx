'use client'

import { useEffect } from 'react'
import { AchievementDetails } from '@/types/achievements'

export default function AchievementNotifier({ newlyUnlocked }: { newlyUnlocked: AchievementDetails[] }) {
  useEffect(() => {
    if (newlyUnlocked && newlyUnlocked.length > 0) {
      newlyUnlocked.forEach((achievement, index) => {
        // Enfileira os popups de conquista com delay de 5 segundos para evitar sobreposição
        const timer = setTimeout(() => {
          window.dispatchEvent(new CustomEvent('achievement-unlocked', {
            detail: {
              id: achievement.id,
              title: achievement.title,
              description: achievement.description
            }
          }))
        }, index * 5000)

        return () => clearTimeout(timer)
      })
    }
  }, [newlyUnlocked])

  return null
}
