'use client'

import { useEffect, useState, useCallback } from 'react'
import { Moon, Sun, Monitor } from 'lucide-react'

type Theme = 'light' | 'dark' | 'system'

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
    const order: Theme[] = ['system', 'light', 'dark']
    const currentIndex = order.indexOf(theme)
    const nextIndex = (currentIndex + 1) % order.length
    setTheme(order[nextIndex])
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