'use client'

import React, { useState, useEffect } from 'react'
import { useParams, usePathname } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { createPortal } from 'react-dom'
import ChatPanel from '@/components/ChatPanel'

export default function ChatFloatingLauncher() {
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  
  const params = useParams()
  const pathname = usePathname()
  
  const workspaceId = params.workspaceId as string | undefined
  const activeWorkspaceId = workspaceId || undefined

  useEffect(() => {
    setMounted(true)
    
    // Opcional: fechar ao mudar de rota ou pressionar Esc
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    
    const handleOpenChat = () => setIsOpen(true)
    
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('open-chat', handleOpenChat)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('open-chat', handleOpenChat)
    }
  }, [])

  // Fechar automaticamente em rotas que não sejam do dashboard
  useEffect(() => {
    if (!pathname?.startsWith('/dashboard')) {
      setIsOpen(false)
    }
  }, [pathname])

  if (!mounted) return null

  // O Portal garante que o ChatRender fique no topo do DOM body, 
  // resolvendo problemas de z-index
  return (
    <>
      {/* Botão no Header (Desktop Only) */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-6 right-8 z-40 hidden md:flex items-center gap-2 rounded-full bg-surface border border-border px-4 py-2 text-sm font-medium text-text-strong shadow-sm hover:shadow-md transition-all hover:border-primary/50"
        aria-label="Abrir Assistente"
        title="Assistente OmniMind"
      >
        <Sparkles className="size-4 text-primary" />
        <span>Assistente</span>
      </button>

      {/* O Modal / Drawer Flutuante renderizado no body */}
      {isOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex">
          {/* Fundo escurecido que fecha ao clicar */}
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" 
            onClick={() => setIsOpen(false)}
          />

          {/* O Painel em si - Bottom Sheet no Mobile, Drawer no Desktop */}
          <div className={`
            absolute bg-surface shadow-2xl transition-transform duration-300 ease-out flex flex-col
            /* Mobile: Bottom Sheet (desliza de baixo) */
            bottom-0 left-0 right-0 h-[85vh] rounded-t-[2rem] border-t border-border overflow-hidden
            /* Desktop: Side Drawer (desliza da direita) */
            md:top-0 md:bottom-0 md:left-auto md:right-0 md:h-full md:w-[450px] md:rounded-none md:border-l md:border-t-0
            animate-in slide-in-from-bottom md:slide-in-from-right
          `}>
            {/* O próprio componente do chat que adaptamos */}
            <div className="flex-1 overflow-hidden h-full">
              <ChatPanel 
                workspaceId={activeWorkspaceId} 
                isFloatingMode={true} 
                onClose={() => setIsOpen(false)} 
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
