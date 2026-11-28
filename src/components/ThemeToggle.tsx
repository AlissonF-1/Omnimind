'use client'

import { useEffect, useState, useCallback } from 'react'
import { Moon, Sun, Monitor } from '@/components/icons'
import { useSettings } from '@/contexts/SettingsContext'

type Theme = 'light' | 'dark' | 'system'
const themes: Theme[] = ['system', 'light', 'dark']
const themeLabels = { dark: 'Tema escuro', light: 'Tema claro', system: 'Seguir sistema' }

export function SavedThemeToggle() {
  const { settings, updateSetting, isUpdating } = useSettings()
  const [saveError, setSaveError] = useState(false)
  const theme = settings.theme
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor

  return (
    <>
      <button type="button" className="btn-secondary w-full justify-start gap-2 disabled:opacity-60"
        aria-label={'Alternar tema (atual: ' + themeLabels[theme] + ')'}
        disabled={isUpdating}
        onClick={async () => {
          const nextTheme = themes[(themes.indexOf(theme) + 1) % themes.length]
          setSaveError(!(await updateSetting('theme', nextTheme)))
        }}
      >
        <Icon className="size-4" aria-hidden="true" />
        <span>{themeLabels[theme]}</span>
      </button>
      {saveError && <p className="text-xs text-error mt-1" role="alert">Não foi possível salvar o tema.</p>}
    </>
  )
}

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>('system')
  const [mounted, setMounted] = useState(false)
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('light')

  // Detecta tema do sistema
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystem = () => setSystemTheme(media.matches ? 'dark' : 'light')
    updateSystem()
    media.addEventListener('change', updateSystem)
    return () => media.removeEventListener('change', updateSystem)
  }, [])

  // Carrega tema salvo ou default system
  useEffect(() => {
    const saved = localStorage.getItem('omnimind-theme') as Theme | null
    if (saved && ['light', 'dark', 'system'].includes(saved)) {
      setTheme(saved)
    } else {
      setTheme('system')
    }
    setMounted(true)
  }, [])

  // Aplica tema ao DOM
  useEffect(() => {
    if (!mounted) return
    const applyTheme = (t: Theme) => {
      const isDark = t === 'dark' || (t === 'system' && systemTheme === 'dark')
      document.documentElement.classList.toggle('dark', isDark)
      // Limpa classe neo caso ainda exista no DOM
      document.documentElement.classList.remove('neo')
    }
    applyTheme(theme)
    localStorage.setItem('omnimind-theme', theme)
  }, [theme, systemTheme, mounted])

  const cycleTheme = useCallback(() => {
    const currentIndex = themes.indexOf(theme)
    const nextIndex = (currentIndex + 1) % themes.length
    setTheme(themes[nextIndex])
  }, [theme])

  // Labels para acessibilidade
  const getLabel = () => {
    switch (theme) {
      case 'dark': return 'Tema escuro'
      case 'light': return 'Tema claro'
      case 'system': return 'Seguir sistema'
      default: return 'Tema'
    }
  }

  const getIcon = () => {
    if (!mounted) return <Monitor className="size-4" />
    if (theme === 'system') return <Monitor className="size-4" />
    return theme === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />
  }

  if (!mounted) {
    return <button className={compact ? 'icon-button' : 'btn-secondary w-full justify-start'} aria-label="Carregando tema...">
      <Monitor className="size-4" />
      {!compact && <span>Carregando...</span>}
    </button>
  }

  return (
    <button
      type="button"
      onClick={cycleTheme}
      className={`
        ${compact ? 'icon-button relative' : 'btn-secondary w-full justify-start gap-2 relative'}
        transition-all duration-200 hover:scale-105 active:scale-95
      `}
      aria-label={`Alternar tema (atual: ${getLabel()})`}
      title={`Alternar tema (atual: ${getLabel()})`}
      aria-pressed={theme !== 'system' ? 'true' : 'false'}
    >
      {getIcon()}
      {!compact && (
        <>
          <span>{getLabel()}</span>
          {theme === 'system' && (
            <span className="ml-auto text-xs text-text-muted">
              {systemTheme === 'dark' ? '🌙' : '☀️'}
            </span>
          )}
        </>
      )}
      {compact && theme === 'system' && (
        <span className="absolute -bottom-1 -right-1 text-[8px]">⚙️</span>
      )}
    </button>
  )
}
