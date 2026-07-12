'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { createWorkspace, updateWorkspace, deleteWorkspace, signOut, archiveWorkspace } from '@/actions/workspaces'
import { BrainCircuit, Folder, Home, Loader2, LogOut, Menu, Plus, Search, MessageSquare, X, MoreHorizontal, Pencil, Trash2, Network, Archive, Trophy, User, CalendarDays } from 'lucide-react'
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
  
  const [loading, setLoading] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

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
        className={`fixed left-0 top-0 z-40 flex h-screen w-72 flex-col border-r border-border bg-surface transition-transform duration-200 md:sticky ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
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

        <div className="flex-1 overflow-y-auto p-4">
          
          {/* Logo */}
          <Link
            href="/dashboard"
            onClick={() => setIsOpen(false)}
            className="mb-8 flex h-10 items-center gap-3 rounded-lg px-2"
          >
            <Image
              src="/logo.png"
              alt="OmniMind Logo"
              width={32}
              height={32}
              className="shrink-0 rounded-lg object-contain"
            />
            <span className="text-lg font-semibold text-text-strong">OmniMind</span>
          </Link>

          <div className="mb-8">
            <p className="mb-2 px-3 text-xs font-semibold uppercase text-text-muted">Menu</p>
            <nav className="space-y-1">
              <Link href="/dashboard" onClick={() => setIsOpen(false)} className={`nav-item ${isActive('/dashboard') ? 'nav-item-active' : ''}`}>
                <Home className="size-4" /> Início
              </Link>
              <Link href="/dashboard/revisoes" onClick={() => setIsOpen(false)} className={`nav-item ${isActive('/dashboard/revisoes') ? 'nav-item-active' : ''}`}>
                <BrainCircuit className="size-4" /> Revisão ativa
              </Link>
              <Link href="/dashboard/busca" onClick={() => setIsOpen(false)} className={`nav-item ${isActive('/dashboard/busca') ? 'nav-item-active' : ''}`}>
                <Search className="size-4" /> Busca semântica
              </Link>
              <Link href="/dashboard/chat" onClick={() => setIsOpen(false)} className={`nav-item ${isActive('/dashboard/chat') ? 'nav-item-active' : ''}`}>
                <MessageSquare className="size-4" /> Assistente (Chat)
              </Link>
              <Link href="/dashboard/grafo" onClick={() => setIsOpen(false)} className={`nav-item ${isActive('/dashboard/grafo') ? 'nav-item-active' : ''}`}>
                <Network className="size-4" /> Rede de Conexões
              </Link>
              <Link href="/dashboard/conquistas" onClick={() => setIsOpen(false)} className={`nav-item ${isActive('/dashboard/conquistas') ? 'nav-item-active' : ''}`}>
                <Trophy className="size-4" /> Minhas Conquistas
              </Link>
              <Link href="/dashboard/calendario" onClick={() => setIsOpen(false)} className={`nav-item ${isActive('/dashboard/calendario') ? 'nav-item-active' : ''}`}>
                <CalendarDays className="size-4" /> Calendário
              </Link>
              <Link href="/dashboard/perfil" onClick={() => setIsOpen(false)} className={`nav-item ${isActive('/dashboard/perfil') ? 'nav-item-active' : ''}`}>
                <User className="size-4" /> Meu Perfil
              </Link>
            </nav>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between px-3">
              <p className="text-xs font-semibold uppercase text-text-muted">Workspaces</p>
              <button
                onClick={() => setIsModalOpen(true)}
                className="inline-flex size-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text-strong focus-visible:outline-2 focus-visible:outline-primary"
                title="Novo workspace"
              >
                <Plus className="size-4" />
              </button>
            </div>

            <nav className="space-y-1">
              {workspaces.filter(w => !w.is_archived).length === 0 ? (
                <p className="px-3 py-2 text-sm text-text-muted">Nenhum workspace ativo.</p>
              ) : (
                workspaces.filter(w => !w.is_archived).map((workspace) => (
                  <div 
                    key={workspace.id} 
                    className={`group relative flex items-center justify-between rounded-md transition-colors ${isActive(`/dashboard/${workspace.id}`) ? 'nav-item-active' : 'hover:bg-surface-muted'}`}
                  >
                    <Link
                      href={`/dashboard/${workspace.id}`}
                      onClick={() => setIsOpen(false)}
                      className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2"
                    >
                      <Folder className="size-4 shrink-0" />
                      <span className="truncate pr-2">{workspace.name}</span>
                    </Link>

                    <button
                      onClick={() => setOpenDropdownId(openDropdownId === workspace.id ? null : workspace.id)}
                      className={`shrink-0 mr-1 p-1.5 rounded-md text-text-muted hover:text-text-strong hover:bg-border transition-all ${openDropdownId === workspace.id ? 'opacity-100 bg-border' : 'opacity-0 group-hover:opacity-100'}`}
                    >
                      <MoreHorizontal className="size-4" />
                    </button>

                    {openDropdownId === workspace.id && (
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
            {workspaces.some(w => w.is_archived) && (
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
                        className="group relative flex items-center justify-between rounded-md transition-colors hover:bg-surface-muted opacity-60 hover:opacity-100"
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
                          className={`shrink-0 mr-1 p-1 rounded-md text-text-muted hover:text-text-strong hover:bg-border transition-all ${openDropdownId === workspace.id ? 'opacity-100 bg-border' : 'opacity-0 group-hover:opacity-100'}`}
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

        <div className="border-t border-border p-4">
          <div className="mb-2">
            <ThemeToggle />
          </div>
          <form action={signOut}>
            <button type="submit" className="nav-item w-full hover:bg-error-soft hover:text-error">
              <LogOut className="size-4" /> Sair da conta
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