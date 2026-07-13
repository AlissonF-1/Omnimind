'use client'

import Link from 'next/link'
import Image from 'next/image'
import { BellDot, Bell, Menu, Sparkles } from 'lucide-react'

interface MobileTopbarProps {
  userName: string
  avatarUrl: string | null
  currentLevel: number
  overdueCards: number
  onMenuOpen: () => void
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function getAvatarRingClass(level: number) {
  if (level <= 5)  return 'ring-2 ring-slate-400/60 dark:ring-slate-600'
  if (level <= 15) return 'ring-2 ring-primary shadow-[0_0_10px_rgba(99,102,241,0.5)] animate-pulse'
  return 'ring-2 ring-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.6)] animate-pulse'
}

export default function MobileTopbar({
  userName,
  avatarUrl,
  currentLevel,
  overdueCards,
  onMenuOpen,
}: MobileTopbarProps) {
  const hasAlert = overdueCards > 0

  return (
    <header className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between gap-3 px-4 h-14 bg-surface/90 backdrop-blur-md border-b border-border md:hidden">
      {/* Hamburguer */}
      <button
        onClick={onMenuOpen}
        className="flex size-11 items-center justify-center rounded-xl text-text-muted hover:text-text-strong hover:bg-surface-muted transition-all shrink-0"
        aria-label="Abrir menu"
      >
        <Menu className="size-6" />
      </button>

      {/* Logo centralizada */}
      <Link
        href="/dashboard"
        className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2"
      >
        <Image
          src="/logo.png"
          alt="OmniMind"
          width={28}
          height={28}
          className="rounded-lg object-contain"
        />
        <span className="text-base font-black text-text-strong tracking-tight">OmniMind</span>
      </Link>

      {/* Acoes da direita */}
      <div className="flex items-center gap-1 shrink-0">

        {/* Botão do Assistente (Chat) */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('open-chat'))}
          className="relative flex size-11 items-center justify-center rounded-xl text-primary hover:bg-primary/10 transition-all"
          aria-label="Abrir Assistente"
        >
          <Sparkles className="size-5" />
        </button>

        {/* Sino de alertas */}
        <Link
          href="/dashboard/revisoes"
          className="relative flex size-11 items-center justify-center rounded-xl text-text-muted hover:text-text-strong hover:bg-surface-muted transition-all"
          aria-label={hasAlert ? `${overdueCards} cards para revisar` : 'Revisoes em dia'}
        >
          {hasAlert ? (
            <BellDot className="size-6 text-red-400" />
          ) : (
            <Bell className="size-6" />
          )}
          {hasAlert && (
            <span className="absolute top-2.5 right-2.5 flex size-2 rounded-full bg-red-500" />
          )}
        </Link>

        {/* Avatar com borda de nivel */}
        <Link
          href="/dashboard/perfil"
          aria-label="Meu perfil"
          className={`relative flex size-11 items-center justify-center rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800 transition-all ${getAvatarRingClass(currentLevel)}`}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={userName}
              className="size-full object-cover rounded-full"
            />
          ) : (
            <span className="text-[12px] font-black text-text-strong leading-none select-none">
              {getInitials(userName)}
            </span>
          )}
        </Link>

      </div>
    </header>
  )
}

