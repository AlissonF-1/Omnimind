'use client'

import { useState, useEffect } from 'react'
import Sidebar from '@/components/Sidebar'
import MobileTopbar from '@/components/MobileTopbar'
import AchievementToast from '@/components/AchievementToast'
import LevelUpModal from '@/components/LevelUpModal'
import ChatFloatingLauncher from '@/components/ChatFloatingLauncher'

interface Workspace {
  id: string
  name: string
  description: string | null
  is_archived?: boolean
}

interface DashboardShellProps {
  children: React.ReactNode
  workspaces: Workspace[]
  userName: string
  avatarUrl: string | null
  avatarIcon?: string | null
  currentLevel: number
  overdueCards: number
}

export default function DashboardShell({
  children,
  workspaces,
  userName,
  avatarUrl,
  avatarIcon,
  currentLevel,
  overdueCards,
}: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle sidebar com Ctrl+B ou Cmd+B
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        const target = e.target as HTMLElement
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        ) {
          return
        }
        e.preventDefault()
        setSidebarOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="app-shell">
      {/* Topbar mobile — compartilha o estado do drawer com a Sidebar */}
      <MobileTopbar
        userName={userName}
        avatarUrl={avatarUrl}
        avatarIcon={avatarIcon}
        currentLevel={currentLevel}
        overdueCards={overdueCards}
        onMenuOpen={() => setSidebarOpen(true)}
      />

      <Sidebar
        workspaces={workspaces}
        isOpen={sidebarOpen}
        onOpen={() => setSidebarOpen(true)}
        onClose={() => setSidebarOpen(false)}
      />

      {/*
        pt-14 no mobile compensa a altura do MobileTopbar fixo (h-14).
        md:pt-0 remove o padding no desktop onde o topbar nao existe.
      */}
      <main className="flex-1 h-screen overflow-y-auto px-5 py-6 pt-20 md:px-8 md:py-8 md:pt-8">
        <div className="max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>

      <AchievementToast />
      <LevelUpModal />
      <ChatFloatingLauncher />
    </div>
  )
}

