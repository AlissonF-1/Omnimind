'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Bell, Ellipsis, Home, Layers, ListChecks, Menu, RefreshCw, Search, Sparkles, ChevronRight } from 'lucide-react'
import { isDashboardRoute } from '@/lib/dashboard-navigation'
import { profileLevelProgress } from '@/lib/profile'
import { assistantPath } from '@/lib/assistant/contracts'

export function openDashboardAssistant() {
  window.dispatchEvent(new Event('open-chat'))
}

function ReviewNotifications({ overdueCards }: { overdueCards: number }) {
  return (
    <Link href="/dashboard/revisoes" className="os-notifications" aria-label={overdueCards > 0
      ? overdueCards + ' cards para revisar'
      : 'Abrir revisões'}
    >
      <Bell size={20} aria-hidden="true" />
      {overdueCards > 0 && <i aria-hidden="true" />}
    </Link>
  )
}

export function DesktopTopbar({ currentLevel, totalXp, overdueCards }: { currentLevel: number; totalXp: number; overdueCards: number }) {
  const progress = profileLevelProgress(currentLevel, totalXp)

  return (
    <header className="os-topbar">
      <Link href="/dashboard/busca" className="os-search" aria-keyshortcuts="Control+K Meta+K">
        <Search size={17} aria-hidden="true" /><span>Buscar conteúdos, questões, conceitos...</span><kbd>Ctrl + K</kbd>
      </Link>
      <div className="os-topbar-controls">
        <ReviewNotifications overdueCards={overdueCards} />
        <Link href="/dashboard/perfil" className="os-level">
          <Sparkles size={21} aria-hidden="true" />
          <span><strong>Nível {currentLevel}</strong><small>{progress.value} / {progress.target} XP</small></span>
          <ChevronRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </header>
  )
}

export default function MobileTopbar({ overdueCards, onMenuOpen, menuOpen }: { overdueCards: number; onMenuOpen: () => void; menuOpen: boolean }) {
  return (
    <header className="os-mobile-header">
      <button type="button" className="os-mobile-menu" onClick={onMenuOpen} aria-label="Abrir menu" aria-expanded={menuOpen} aria-controls="dashboard-sidebar">
        <Menu size={22} aria-hidden="true" />
      </button>
      <Link href="/dashboard" className="os-mobile-brand"><Image src="/logo.png" alt="" width={29} height={29} loading="eager" />OmniMind</Link>
      <ReviewNotifications overdueCards={overdueCards} />
    </header>
  )
}

export function MobileDock({ onMenuOpen, menuOpen }: { onMenuOpen: () => void; menuOpen: boolean }) {
  const pathname = usePathname()
  const current = (href: string) => isDashboardRoute(pathname, href) ? 'page' : undefined

  return (
    <nav className="os-dock" aria-label="Atalhos mobile">
      <Link href="/dashboard" aria-current={current('/dashboard')}><Home size={19} aria-hidden="true" />Início</Link>
      {/* Trilhas e Questões exigem navegação de documento para respeitar o cache offline. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/dashboard/trilhas" aria-current={current('/dashboard/trilhas')}><Layers size={19} aria-hidden="true" />Trilhas</a>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/dashboard/questoes" aria-current={current('/dashboard/questoes')}><ListChecks size={19} aria-hidden="true" />Questões</a>
      <button type="button" className="os-dock-assistant" onClick={openDashboardAssistant} aria-current={current(assistantPath)} aria-label="Abrir Assistente">
        <Image src="/images/dashboard/assistant.webp" alt="" width={37} height={37} loading="eager" />
        <span>Assistente</span>
      </button>
      <Link href="/dashboard/revisoes" aria-current={current('/dashboard/revisoes')}><RefreshCw size={19} aria-hidden="true" />Revisão</Link>
      <button type="button" onClick={onMenuOpen} aria-expanded={menuOpen} aria-controls="dashboard-sidebar"><Ellipsis size={20} aria-hidden="true" />Mais</button>
    </nav>
  )
}
