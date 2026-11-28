'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import MobileTopbar, { DesktopTopbar, MobileDock } from '@/components/MobileTopbar'
import AchievementToast from '@/components/AchievementToast'
import LevelUpModal from '@/components/LevelUpModal'
import ChatFloatingLauncher from '@/components/ChatFloatingLauncher'
import InstallPromptModal from '@/components/InstallPromptModal'
import { useFlashcardsPrefetch } from '@/hooks/useFlashcardsPrefetch'
import PwaRegister from '@/components/PwaRegister'

interface Workspace {
  id: string
  name: string
  description: string | null
  is_archived?: boolean
}

interface DashboardShellProps {
  children: React.ReactNode
  workspaces: Workspace[]
  accountId: string | null
  userName: string
  avatarUrl: string | null
  avatarIcon?: string | null
  currentLevel: number
  totalXp: number
  overdueCards: number
}

const desktopQuery = '(min-width: 768px)'

function subscribeViewport(notify: () => void) {
  const media = window.matchMedia(desktopQuery)
  media.addEventListener('change', notify)
  return () => media.removeEventListener('change', notify)
}

export default function DashboardShell({
  children, workspaces, accountId, userName, avatarUrl, avatarIcon, currentLevel, totalXp, overdueCards,
}: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const onDesktop = useSyncExternalStore(subscribeViewport, () => window.matchMedia(desktopQuery).matches, () => false)
  const trigger = useRef<HTMLElement | null>(null)
  const pathname = usePathname()
  const router = useRouter()
  const drawerOpen = !onDesktop && sidebarOpen
  const isHome = pathname === '/dashboard'

  useFlashcardsPrefetch(accountId)

  function openMenu() {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setSidebarOpen(true)
  }

  function closeMenu(restoreFocus = false) {
    setSidebarOpen(false)
    if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus())
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || document.querySelector('dialog[open]')) return
      if (event.key === 'Escape' && drawerOpen) {
        closeMenu(true)
        return
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.repeat) return
      switch (event.key.toLowerCase()) {
        case 'k':
          event.preventDefault()
          closeMenu()
          router.push('/dashboard/busca')
          break
        case 'b':
          if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]')) return
          event.preventDefault()
          if (onDesktop) setCollapsed((value) => !value)
          else if (drawerOpen) closeMenu(true)
          else openMenu()
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [drawerOpen, onDesktop, router])

  return (
    <div className="omni-shell">
      <div className="os-mobile-chrome" inert={drawerOpen}>
        <MobileTopbar overdueCards={overdueCards} onMenuOpen={openMenu} menuOpen={drawerOpen} />
        <MobileDock onMenuOpen={openMenu} menuOpen={drawerOpen} />
      </div>
      <Sidebar workspaces={workspaces} userName={userName} avatarUrl={avatarUrl} avatarIcon={avatarIcon}
        drawerOpen={drawerOpen} collapsed={onDesktop && collapsed} onCollapse={() => setCollapsed((value) => !value)}
        onClose={closeMenu}
      />
      <main className={'os-main' + (isHome ? ' os-home-main' : '')} inert={drawerOpen}>
        <div className="os-page">
          {isHome && <DesktopTopbar currentLevel={currentLevel} totalXp={totalXp} overdueCards={overdueCards} />}
          {children}
        </div>
      </main>
      <AchievementToast />
      <LevelUpModal />
      <ChatFloatingLauncher key={accountId} accountId={accountId} workspaces={workspaces} />
      <InstallPromptModal />
      <PwaRegister />
    </div>
  )
}
