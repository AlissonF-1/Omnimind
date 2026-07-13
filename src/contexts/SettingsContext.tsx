'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { UserPreferences, DEFAULT_PREFERENCES } from '@/types/settings'
import { updateUserPreferences } from '@/actions/settings'

interface SettingsContextType {
  settings: UserPreferences
  updateSetting: <K extends keyof Omit<UserPreferences, 'user_id' | 'updated_at'>>(
    key: K,
    value: UserPreferences[K]
  ) => Promise<void>
  isUpdating: boolean
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ 
  children,
  initialSettings
}: { 
  children: React.ReactNode
  initialSettings: UserPreferences
}) {
  const [settings, setSettings] = useState<UserPreferences>(initialSettings)
  const [isUpdating, setIsUpdating] = useState(false)

  // Atualiza a classe de tema no documento se o tema mudar ou sistema mudar
  useEffect(() => {
    const root = document.documentElement
    
    const applyTheme = (isDark: boolean) => {
      if (isDark) {
        root.classList.add('dark')
        root.classList.remove('light')
      } else {
        root.classList.add('light')
        root.classList.remove('dark')
      }
    }

    if (settings.theme === 'dark') {
      applyTheme(true)
    } else if (settings.theme === 'light') {
      applyTheme(false)
    } else {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      applyTheme(mediaQuery.matches)
      
      const handleChange = (e: MediaQueryListEvent) => applyTheme(e.matches)
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
  }, [settings.theme])

  const updateSetting = async <K extends keyof Omit<UserPreferences, 'user_id' | 'updated_at'>>(
    key: K,
    value: UserPreferences[K]
  ) => {
    const prevSettings = { ...settings }
    try {
      setIsUpdating(true)
      // Optimistic update
      setSettings(prev => ({ ...prev, [key]: value }))
      
      // Server update
      await updateUserPreferences({ [key]: value })
    } catch (error) {
      console.error('Failed to update setting:', error)
      // Revert in case of error
      setSettings(prevSettings)
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <SettingsContext.Provider value={{ settings, updateSetting, isUpdating }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}
