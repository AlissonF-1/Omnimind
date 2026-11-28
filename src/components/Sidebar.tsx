'use client'

import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  AcademyIcon, AchievementsIcon, Archive, ArrowRight, ChevronDown, Ellipsis, ExperienceIcon, Folder, Home,
  LearningPathIcon, LogOut, MemoryIcon, PanelLeftClose, PanelLeftOpen, Pencil, Plus, QuestionsIcon,
  ReviewsIcon, Settings, StudyPlanIcon, Trash2, User, X,
} from '@/components/icons'
import { createWorkspace, updateWorkspace, deleteWorkspace, signOut, archiveWorkspace } from '@/actions/workspaces'
import { SavedThemeToggle } from '@/components/ThemeToggle'
import AvatarFace from '@/components/AvatarFace'
import { isDashboardRoute, ULTIMATUM_HREF } from '@/lib/dashboard-navigation'
import { AcademyNavigation, AcademyNavigationFallback } from '@/components/academy/AcademyNavigation'

interface Workspace {
  id: string
  name: string
  description: string | null
  is_archived?: boolean
}

interface SidebarProps {
  workspaces: Workspace[]
  userName: string
  avatarUrl: string | null
  avatarIcon?: string | null
  drawerOpen: boolean
  collapsed: boolean
  onCollapse: () => void
  onClose: (restoreFocus?: boolean) => void
}

const links = [
  { href: '/dashboard', icon: Home, label: 'Início' },
  { href: '/dashboard/academy', icon: AcademyIcon, label: 'Academy', documentNavigation: true },
  { href: '/dashboard/trilhas', icon: LearningPathIcon, label: 'Trilhas', documentNavigation: true },
  { href: '/dashboard/questoes', icon: QuestionsIcon, label: 'Questões', documentNavigation: true },
  { href: '/dashboard/revisoes', icon: ReviewsIcon, label: 'Revisão ativa' },
  { href: '/dashboard/busca', icon: MemoryIcon, label: 'Busca semântica' },
  { href: '/dashboard/conquistas', icon: AchievementsIcon, label: 'Minhas Conquistas' },
]

export default function Sidebar({
  workspaces, userName, avatarUrl, avatarIcon, drawerOpen, collapsed, onCollapse, onClose,
}: SidebarProps) {
  const [showWorkspaces, setShowWorkspaces] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [expandedOptions, setExpandedOptions] = useState<string | null>(null)
  const [editing, setEditing] = useState<Workspace | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [workspaceError, setWorkspaceError] = useState('')
  const closeButton = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const dialogTrigger = useRef<HTMLElement | null>(null)
  const pathname = usePathname()
  const router = useRouter()
  const activeWorkspaces = workspaces.filter((workspace) => !workspace.is_archived)
  const archivedWorkspaces = workspaces.filter((workspace) => workspace.is_archived)
  const current = (href: string) => isDashboardRoute(pathname, href) ? 'page' : undefined
  const isAcademy = isDashboardRoute(pathname, '/dashboard/academy')

  useEffect(() => {
    if (drawerOpen) closeButton.current?.focus()
  }, [drawerOpen])

  useEffect(() => {
    if (editing && !dialog.current?.open) {
      dialog.current?.showModal()
      dialog.current?.querySelector('input')?.focus()
    }
  }, [editing])

  function openEditor(workspace: Workspace | 'new') {
    dialogTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setError('')
    setEditing(workspace)
  }

  async function saveWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing || busy) return
    setBusy(true)
    setError('')
    try {
      const data = new FormData(event.currentTarget)
      const result = editing === 'new' ? await createWorkspace(data) : await updateWorkspace(editing.id, data)
      if (result.error) {
        setError(result.error)
        return
      }
      setShowWorkspaces(true)
      dialog.current?.close()
      router.refresh()
    } catch {
      setError('Não foi possível salvar o workspace. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  async function changeWorkspace(workspace: Workspace, action: 'archive' | 'delete') {
    if (busy) return
    if (action === 'delete' && !window.confirm('Excluir este workspace e suas notas e flashcards? Esta ação é irreversível.')) return
    setBusy(true)
    setWorkspaceError('')
    try {
      const result = action === 'delete'
        ? await deleteWorkspace(workspace.id)
        : await archiveWorkspace(workspace.id, !workspace.is_archived)
      if (result.error) {
        setWorkspaceError(result.error)
        return
      }
      setExpandedOptions(null)
      if (action === 'delete' && current('/dashboard/' + workspace.id)) {
        onClose()
        router.push('/dashboard')
      }
      router.refresh()
    } catch {
      setWorkspaceError('Não foi possível alterar o workspace. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  function workspaceRow(workspace: Workspace) {
    const href = '/dashboard/' + workspace.id
    const expanded = expandedOptions === workspace.id

    return (
      <li key={workspace.id}>
        <div className="os-workspace-row">
          <Link href={href} onClick={() => onClose()} aria-current={current(href)}>
            <Folder size={16} aria-hidden="true" /><span>{workspace.name}</span>
          </Link>
          <button type="button" className="os-icon-button" aria-label={'Opções de ' + workspace.name}
            aria-expanded={expanded} onClick={() => { setWorkspaceError(''); setExpandedOptions(expanded ? null : workspace.id) }}
          >
            <Ellipsis size={17} aria-hidden="true" />
          </button>
        </div>
        {expanded && (
          <div className="os-workspace-options">
            {!workspace.is_archived && <button type="button" onClick={() => openEditor(workspace)} disabled={busy}><Pencil size={15} aria-hidden="true" />Editar</button>}
            <button type="button" onClick={() => changeWorkspace(workspace, 'archive')} disabled={busy}>
              <Archive size={15} aria-hidden="true" />{workspace.is_archived ? 'Desarquivar' : 'Arquivar'}
            </button>
            <button type="button" className="os-danger" onClick={() => changeWorkspace(workspace, 'delete')} disabled={busy}>
              <Trash2 size={15} aria-hidden="true" />Excluir
            </button>
            {workspaceError && <p className="os-danger" role="alert">{workspaceError}</p>}
          </div>
        )}
      </li>
    )
  }

  const editedWorkspace = editing && editing !== 'new' ? editing : null
  const mainNavigation = <nav className="os-links" aria-label="Navegação principal">
    {links.map(({ href, icon: Icon, label, documentNavigation }) => {
      const NavigationLink = documentNavigation ? 'a' : Link
      return <NavigationLink key={href} href={href} aria-current={current(href)} aria-label={label} title={collapsed ? label : undefined} onClick={() => onClose()}>
        <Icon size={18} aria-hidden="true" /><span>{label}</span>
      </NavigationLink>
    })}
  </nav>

  return (
    <>
      {drawerOpen && <div aria-hidden="true" className="os-scrim" onClick={() => onClose(true)} />}
      <aside id="dashboard-sidebar" className="os-sidebar" data-open={drawerOpen} data-collapsed={collapsed} data-academy={isAcademy} aria-label="Menu do OmniMind">
        <div className="os-brand-row">
          <Link href="/dashboard" className="os-brand" aria-label="OmniMind, início" onClick={() => onClose()}>
            <Image src="/logo.png?v=2" alt="" width={36} height={36} unoptimized /><span>OmniMind{isAcademy && <small className="ac3-brand-label">Academy</small>}</span>
          </Link>
          <button ref={closeButton} type="button" className="os-icon-button os-drawer-close" aria-label="Fechar menu" onClick={() => onClose(true)}>
            <X size={22} aria-hidden="true" />
          </button>
        </div>

        <div className="os-sidebar-scroll">
          {isAcademy && !collapsed ? <>
            <Suspense fallback={<AcademyNavigationFallback />}><AcademyNavigation onNavigate={() => onClose()} /></Suspense>
            <details className="ac3-rail-global"><summary>Menu OmniMind</summary>{mainNavigation}</details>
          </> : mainNavigation}

          <section className="os-workspaces" aria-label="Workspaces">
            <div className="os-workspace-header">
              <button type="button" className="os-utility" aria-expanded={showWorkspaces && !collapsed} aria-controls="os-workspaces-list"
                title="Workspaces" onClick={() => {
                  if (collapsed) { onCollapse(); setShowWorkspaces(true) }
                  else setShowWorkspaces((value) => !value)
                }}
              >
                <Folder size={17} aria-hidden="true" /><span>Workspaces</span><ChevronDown size={14} aria-hidden="true" />
              </button>
              <button type="button" className="os-icon-button os-new-workspace" aria-label="Novo workspace" title="Novo workspace" onClick={() => openEditor('new')}>
                <Plus size={18} aria-hidden="true" />
              </button>
            </div>
            <div id="os-workspaces-list" hidden={collapsed || !showWorkspaces}>
              {activeWorkspaces.length ? <ul>{activeWorkspaces.map(workspaceRow)}</ul> : <p className="os-no-workspaces">Nenhum workspace ativo.</p>}
              {archivedWorkspaces.length > 0 && (
                <>
                  <button type="button" className="os-utility os-archived-toggle" aria-expanded={showArchived} aria-controls="os-archived-list" onClick={() => setShowArchived((open) => !open)}>
                    <Archive size={16} aria-hidden="true" /><span>Arquivados ({archivedWorkspaces.length})</span><ChevronDown size={14} aria-hidden="true" />
                  </button>
                  <ul id="os-archived-list" hidden={!showArchived}>{archivedWorkspaces.map(workspaceRow)}</ul>
                </>
              )}
            </div>
          </section>

          <div className="os-ultimatum">
            <div><ExperienceIcon size={18} aria-hidden="true" /><strong>Modo Ultimato</strong></div>
            <p>Quiz com seus flashcards menos estáveis.</p>
            <Link href={ULTIMATUM_HREF} className="os-ultimatum-link" aria-label="Iniciar Modo Ultimato" title="Modo Ultimato" onClick={() => onClose()}>
              <span>Iniciar agora</span><ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>

        <footer className="os-sidebar-footer">
          <div className="os-theme-control"><SavedThemeToggle /></div>
          <Link href="/dashboard/calendario" className="os-utility" aria-label="Calendário" title="Calendário" aria-current={current('/dashboard/calendario')} onClick={() => onClose()}>
            <StudyPlanIcon size={17} aria-hidden="true" /><span>Calendário</span>
          </Link>
          <Link href="/dashboard/configuracoes" className="os-utility" aria-label="Configurações" title="Configurações" aria-current={current('/dashboard/configuracoes')} onClick={() => onClose()}>
            <Settings size={17} aria-hidden="true" /><span>Configurações</span>
          </Link>
          <button type="button" className="os-utility os-collapse" aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            title={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'} onClick={onCollapse}
          >
            {collapsed ? <PanelLeftOpen size={17} aria-hidden="true" /> : <PanelLeftClose size={17} aria-hidden="true" />}
            <span>Recolher menu</span>
          </button>
          <details className="os-account">
            <summary aria-label="Minha conta" title={userName}>
              <span className="os-avatar"><AvatarFace name={userName} avatarIcon={avatarIcon} avatarUrl={avatarUrl} size={32} /></span>
              <span>Minha conta</span><ChevronDown size={14} aria-hidden="true" />
            </summary>
            <Link href="/dashboard/perfil" className="os-utility" aria-label="Meu perfil" title="Meu perfil" aria-current={current('/dashboard/perfil')} onClick={() => onClose()}>
              <User size={17} aria-hidden="true" /><span>Meu perfil</span>
            </Link>
            <form action={signOut}><button type="submit" className="os-utility" aria-label="Sair da conta" title="Sair da conta">
              <LogOut size={17} aria-hidden="true" /><span>Sair da conta</span>
            </button></form>
          </details>
        </footer>
      </aside>

      <dialog ref={dialog} className="os-dialog" aria-labelledby="os-workspace-title" onCancel={(event) => { if (busy) event.preventDefault() }}
        onClose={() => { setEditing(null); dialogTrigger.current?.focus() }}
      >
        <div className="os-dialog-title">
          <h2 id="os-workspace-title">{editedWorkspace ? 'Editar workspace' : 'Novo workspace'}</h2>
          <button type="button" className="os-icon-button" disabled={busy} aria-label="Fechar edição de workspace" onClick={() => dialog.current?.close()}><X size={20} aria-hidden="true" /></button>
        </div>
        <form key={editedWorkspace?.id ?? 'new'} onSubmit={saveWorkspace}>
          <label>Nome<input name="name" className="field" defaultValue={editedWorkspace?.name} required placeholder="Ciência da Computação" /></label>
          <label>Descrição<input name="description" className="field" defaultValue={editedWorkspace?.description ?? ''} placeholder="Anotações do semestre" /></label>
          {error && <p role="alert" className="os-danger">{error}</p>}
          <div className="os-dialog-actions">
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => dialog.current?.close()}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Salvando…' : editedWorkspace ? 'Salvar alterações' : 'Criar workspace'}</button>
          </div>
        </form>
      </dialog>
    </>
  )
}
