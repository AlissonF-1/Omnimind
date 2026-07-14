'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { createWorkspace, updateWorkspace, deleteWorkspace, signOut, archiveWorkspace } from '@/actions/workspaces'
import { BrainCircuit, Folder, Home, Loader2, LogOut, Menu, Plus, Search, MessageSquare, X, MoreHorizontal, Pencil, Trash2, Network, Archive, Trophy, User, CalendarDays, Mic, Settings } from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'

interface Workspace {
  id: string
  name: string
  description: string | null
  is_archived?: boolean
}

interface SidebarProps {
  workspaces: Workspace[]
  isOpen?: boolean
  onOpen?: () => void
  onClose?: () => void
}

export default function Sidebar({ workspaces, isOpen: isOpenProp, onOpen, onClose }: SidebarProps) {
  const [isOpenInternal, setIsOpenInternal] = useState(false)
  
  // Usa controle externo se passado, senao usa estado interno
  const isOpen = isOpenProp !== undefined ? isOpenProp : isOpenInternal
  const setIsOpen = (val: boolean) => {
    if (val) {
      onOpen ? onOpen() : setIsOpenInternal(true)
    } else {
      onClose ? onClose() : setIsOpenInternal(false)
    }
  }
  const [isModalOpen, setIsModalOpen] = useState(false)
  
  // Novos estados para a arquitetura de Dropdown e Edição
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false) // Estado de foco (Apenas Desktop)
  
  const [loading, setLoading] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Intercepta Ctrl+K (ou Cmd+K)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setIsOpen(false)
        router.push('/dashboard/busca')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [router])

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    await createWorkspace(formData)
    setLoading(false)
    setIsModalOpen(false)
  }

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingWorkspace) return
    
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    await updateWorkspace(editingWorkspace.id, formData)
    setLoading(false)
    setEditingWorkspace(null)
  }

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta workspace? Todas as notas e flashcards serão perdidos.')) {
      await deleteWorkspace(id)
      setOpenDropdownId(null)
      if (pathname?.includes(id)) {
        router.push('/dashboard')
      }
    }
  }

  const handleToggleArchive = async (id: string, archive: boolean) => {
    await archiveWorkspace(id, archive)
    setOpenDropdownId(null)
  }

  const isActive = (path: string) => {
    if (!pathname) return false
    if (path === '/dashboard' && pathname === '/dashboard') return true
    if (path !== '/dashboard' && pathname.startsWith(path)) return true
    return false
  }

  const getLinkClass = (path: string) => {
    const active = isActive(path)
    const base = `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 group relative ${isCollapsed ? 'justify-center' : ''}`
    
    if (active) {
      // Estilo Pill Glow (Cyber)
      return `${base} text-primary bg-primary/10 shadow-[inset_3px_0_0_0_#6366f1]`
    }
    return `${base} text-text-medium hover:bg-surface-muted hover:text-text-strong`
  }

  const MAIN_LINKS = [
    { href: '/dashboard', icon: Home, label: 'Início' },
    { href: '/dashboard/revisoes', icon: BrainCircuit, label: 'Revisão ativa' },
    { href: '/dashboard/feynman', icon: Mic, label: 'Feynman Sandbox' },
    { href: '/dashboard/busca', icon: Search, label: 'Busca semântica' },
    { href: '/dashboard/grafo', icon: Network, label: 'Rede de Conexões' },
    { href: '/dashboard/conquistas', icon: Trophy, label: 'Minhas Conquistas' },
    { href: '/dashboard/calendario', icon: CalendarDays, label: 'Calendário' },
    { href: '/dashboard/perfil', icon: User, label: 'Meu Perfil' },
    { href: '/dashboard/configuracoes', icon: Settings, label: 'Configurações' },
  ]

  return (
    <>
      {/* Overlay invisível para fechar o dropdown ao clicar fora */}
      {openDropdownId && (
        <div className="fixed inset-0 z-40" onClick={() => setOpenDropdownId(null)} />
      )}

      {/* Botao hamburger NO header mobile — agora controlado pelo MobileTopbar */}
      {/* Mantemos um fallback caso o MobileTopbar nao esteja presente */}
      {!isOpenProp && !onOpen && !isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="icon-button fixed left-4 top-4 z-50 md:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="size-5" />
        </button>
      )}

      {/* Overlay de fundo quando a sidebar está aberta em mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/30 backdrop-blur-sm md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border bg-surface transition-all duration-300 md:sticky ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${isCollapsed ? 'w-20' : 'w-72'}`}
      >
        {/* Botão de fechar DENTRO da sidebar (não sobrepõe a logo) */}
        {isOpen && (
          <button
            onClick={() => setIsOpen(false)}
            className="absolute right-4 top-4 z-50 md:hidden text-text-muted hover:text-text-strong transition-colors"
            aria-label="Fechar menu"
          >
            <X className="size-6" />
          </button>
        )}

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
          
          {/* Logo e Toggle de Colapso (Mobile Only) */}
          <div className="flex items-center justify-between mb-6 px-2">
            <Link
              href="/dashboard"
              onClick={() => setIsOpen(false)}
              className={`flex h-10 items-center gap-3 rounded-lg overflow-hidden ${isCollapsed ? 'justify-center w-full' : ''}`}
            >
              <Image
                src="/logo.png"
                alt="OmniMind Logo"
                width={32}
                height={32}
                className="shrink-0 rounded-lg object-contain"
              />
              {!isCollapsed && <span className="text-lg font-semibold text-text-strong whitespace-nowrap">OmniMind</span>}
            </Link>
          </div>

          {/* Fake Search Bar / Command Palette */}
          <div className="mb-6 px-2">
            <button 
              onClick={() => {
                setIsOpen(false)
                router.push('/dashboard/busca')
              }}
              className={`flex items-center w-full gap-3 rounded-md border border-border/50 bg-surface-muted/50 p-2 text-text-muted hover:text-text-strong hover:bg-surface-muted transition-colors ${isCollapsed ? 'justify-center' : 'justify-between'}`} 
              title="Buscar comandos (Ctrl+K)"
            >
              <div className="flex items-center gap-2">
                <Search className="size-4 shrink-0" />
                {!isCollapsed && <span className="text-sm truncate">Comandos...</span>}
              </div>
              {!isCollapsed && <span className="text-[10px] font-bold border border-border/60 rounded px-1.5 py-0.5 bg-surface-elevated shrink-0">Ctrl+K</span>}
            </button>
          </div>

          <div className="mb-8">
            {!isCollapsed && <p className="mb-2 px-3 text-xs font-semibold uppercase text-text-muted">Menu</p>}
            <nav className="space-y-1">
              {MAIN_LINKS.map((link) => {
                const Icon = link.icon
                return (
                  <Link 
                    key={link.href} 
                    href={link.href} 
                    onClick={() => setIsOpen(false)} 
                    className={getLinkClass(link.href)}
                    title={isCollapsed ? link.label : undefined}
                  >
                    <Icon className="size-4 shrink-0" /> 
                    {!isCollapsed && <span className="truncate">{link.label}</span>}
                  </Link>
                )
              })}
            </nav>
          </div>

          <div>
            <div className={`mb-2 flex items-center px-3 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
              {!isCollapsed && <p className="text-xs font-semibold uppercase text-text-muted">Workspaces</p>}
              <button
                onClick={() => setIsModalOpen(true)}
                className="inline-flex size-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text-strong focus-visible:outline-2 focus-visible:outline-primary shrink-0"
                title="Novo workspace"
              >
                <Plus className="size-4" />
              </button>
            </div>

            <nav className="space-y-1">
              {workspaces.filter(w => !w.is_archived).length === 0 ? (
                !isCollapsed && <p className="px-3 py-2 text-sm text-text-muted">Nenhum ativo.</p>
              ) : (
                workspaces.filter(w => !w.is_archived).map((workspace) => (
                  <div 
                    key={workspace.id} 
                    className={`relative group ${openDropdownId === workspace.id ? 'z-30' : 'z-10'}`}
                  >
                    <div className="flex items-center">
                      <Link
                        href={`/dashboard/${workspace.id}`}
                        onClick={() => setIsOpen(false)}
                        className={`flex-1 ${getLinkClass(`/dashboard/${workspace.id}`)} ${isCollapsed ? '!px-0 justify-center w-full' : ''}`}
                        title={isCollapsed ? workspace.name : undefined}
                      >
                        <Folder className="size-4 shrink-0" />
                        {!isCollapsed && <span className="truncate pr-8">{workspace.name}</span>}
                      </Link>

                      {!isCollapsed && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            setOpenDropdownId(openDropdownId === workspace.id ? null : workspace.id)
                          }}
                          className={`absolute right-1 p-1.5 rounded-md text-text-muted hover:text-text-strong hover:bg-surface-elevated transition-all ${openDropdownId === workspace.id ? 'opacity-100 bg-surface-elevated' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </button>
                      )}
                    </div>

                    {openDropdownId === workspace.id && !isCollapsed && (
                      <div className="absolute right-2 top-10 z-50 w-40 rounded-lg border border-border bg-surface p-1 shadow-lg panel animate-in fade-in zoom-in-95 duration-100">
                        <button
                          onClick={() => {
                            setEditingWorkspace(workspace)
                            setOpenDropdownId(null)
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-text-medium hover:bg-surface-muted hover:text-text-strong transition-colors"
                        >
                          <Pencil className="size-4" /> Editar
                        </button>
                        <button
                          onClick={() => handleToggleArchive(workspace.id, true)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-text-medium hover:bg-surface-muted hover:text-text-strong transition-colors mt-1"
                        >
                          <Archive className="size-4" /> Arquivar
                        </button>
                        <button
                          onClick={() => handleDelete(workspace.id)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-error hover:bg-error-soft transition-colors mt-1"
                        >
                          <Trash2 className="size-4" /> Excluir
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </nav>

            {/* Seção colapsável de Workspaces Arquivadas */}
            {!isCollapsed && workspaces.some(w => w.is_archived) && (
              <div className="mt-4 pt-4 border-t border-border/50">
                <button
                  onClick={() => setShowArchived(!showArchived)}
                  className="flex items-center justify-between w-full px-3 py-1.5 rounded-md text-xs font-semibold uppercase text-text-muted hover:bg-surface-muted hover:text-text-strong transition-all"
                >
                  <span className="flex items-center gap-2">
                    <Archive className="size-3.5" />
                    Arquivadas ({workspaces.filter(w => w.is_archived).length})
                  </span>
                  <span>{showArchived ? '▼' : '►'}</span>
                </button>
                {showArchived && (
                  <nav className="space-y-1 mt-2 pl-2">
                    {workspaces.filter(w => w.is_archived).map((workspace) => (
                      <div 
                        key={workspace.id} 
                        className={`group relative flex items-center justify-between rounded-md transition-colors hover:bg-surface-muted opacity-60 hover:opacity-100 ${openDropdownId === workspace.id ? 'z-30' : 'z-10'}`}
                      >
                        <Link
                          href={`/dashboard/${workspace.id}`}
                          onClick={() => setIsOpen(false)}
                          className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2 text-xs"
                        >
                          <Folder className="size-3.5 shrink-0" />
                          <span className="truncate pr-2">{workspace.name}</span>
                        </Link>

                        <button
                          onClick={() => setOpenDropdownId(openDropdownId === workspace.id ? null : workspace.id)}
                          className={`shrink-0 mr-1 p-1 rounded-md text-text-muted hover:text-text-strong hover:bg-border transition-all ${openDropdownId === workspace.id ? 'opacity-100 bg-border' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'}`}
                        >
                          <MoreHorizontal className="size-3.5" />
                        </button>

                        {openDropdownId === workspace.id && (
                          <div className="absolute right-2 top-8 z-50 w-40 rounded-lg border border-border bg-surface p-1 shadow-lg panel animate-in fade-in zoom-in-95 duration-100">
                            <button
                              onClick={() => handleToggleArchive(workspace.id, false)}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-text-medium hover:bg-surface-muted hover:text-text-strong transition-colors"
                            >
                              <Archive className="size-4" /> Desarquivar
                            </button>
                            <button
                              onClick={() => handleDelete(workspace.id)}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-error hover:bg-error-soft transition-colors mt-1"
                            >
                              <Trash2 className="size-4" /> Excluir
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </nav>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border p-4 space-y-2">
          {/* Botão de Colapso (Desktop) */}
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`hidden md:flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-text-muted hover:bg-surface-muted hover:text-text-strong transition-colors ${isCollapsed ? 'justify-center' : ''}`}
            title={isCollapsed ? "Expandir Menu" : "Recolher Menu"}
          >
            <MoreHorizontal className="size-4 shrink-0" />
            {!isCollapsed && <span>Encolher Sidebar</span>}
          </button>

          <div className={`${isCollapsed ? 'hidden' : 'block'}`}>
            <ThemeToggle />
          </div>
          <form action={signOut}>
            <button type="submit" className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-text-medium transition-colors hover:bg-error-soft hover:text-error ${isCollapsed ? 'justify-center' : ''}`} title="Sair da conta">
              <LogOut className="size-4 shrink-0" /> 
              {!isCollapsed && <span>Sair da conta</span>}
            </button>
          </form>
        </div>
      </aside>

      {/* Modal de Criação */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="panel w-full max-w-md p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-text-strong">Novo workspace</h3>
                <p className="mt-1 text-sm text-text-medium">Crie um espaço para uma matéria, projeto ou tema.</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="icon-button">
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-text-strong">Nome</span>
                <input name="name" required placeholder="Ciência da Computação" className="field w-full" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-text-strong">Descrição</span>
                <input name="description" placeholder="Anotações do semestre" className="field w-full" />
              </label>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">Cancelar</button>
                <button type="submit" disabled={loading} className="btn-primary">
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  {loading ? 'Criando...' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Edição */}
      {editingWorkspace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="panel w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-text-strong">Editar workspace</h3>
              </div>
              <button onClick={() => setEditingWorkspace(null)} className="icon-button">
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={handleUpdate} className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-text-strong">Nome</span>
                <input name="name" defaultValue={editingWorkspace.name} required className="field w-full" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-text-strong">Descrição</span>
                <input name="description" defaultValue={editingWorkspace.description || ''} className="field w-full" />
              </label>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setEditingWorkspace(null)} className="btn-secondary">Cancelar</button>
                <button type="submit" disabled={loading} className="btn-primary">
                  {loading ? <Loader2 className="size-4 animate-spin" /> : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}