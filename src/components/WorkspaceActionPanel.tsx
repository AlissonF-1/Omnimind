'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, Trash2, Settings2, Save, X, AlertTriangle, Loader2 } from 'lucide-react'
import { archiveWorkspace, deleteWorkspace, updateWorkspace } from '@/actions/workspaces'

interface WorkspaceActionPanelProps {
  workspace: {
    id: string
    name: string
    description: string | null
    is_archived?: boolean
  }
  noteCount: number
  flashcardCount: number
}

export default function WorkspaceActionPanel({ workspace, noteCount, flashcardCount }: WorkspaceActionPanelProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [name, setName] = useState(workspace.name)
  const [description, setDescription] = useState(workspace.description ?? '')
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const isArchived = workspace.is_archived ?? false

  // Limpa mensagem após 5s
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [message])

  const resetForm = () => {
    setName(workspace.name)
    setDescription(workspace.description ?? '')
    setMessage(null)
  }

  const openSettings = () => {
    resetForm()
    setIsOpen(true)
  }

  const handleSave = () => {
    startTransition(async () => {
      setMessage(null)
      const formData = new FormData()
      formData.set('name', name)
      formData.set('description', description)

      const result = await updateWorkspace(workspace.id, formData)
      if (result?.error) {
        setMessage({ type: 'error', text: result.error })
        return
      }
      setMessage({ type: 'success', text: 'Workspace atualizado com sucesso!' })
      setIsOpen(false)
      router.refresh()
    })
  }

  const handleArchive = () => {
    startTransition(async () => {
      setMessage(null)
      const result = await archiveWorkspace(workspace.id, !isArchived)
      if (result?.error) {
        setMessage({ type: 'error', text: result.error })
        return
      }
      setIsArchiveModalOpen(false)
      setIsOpen(false)
      router.push('/dashboard')
    })
  }

  const handleDelete = () => {
    if (deleteConfirmText !== workspace.name) {
      setMessage({ type: 'error', text: 'Digite o nome do workspace para confirmar.' })
      return
    }
    startTransition(async () => {
      setMessage(null)
      const result = await deleteWorkspace(workspace.id)
      if (result?.error) {
        setMessage({ type: 'error', text: result.error })
        return
      }
      setIsDeleteModalOpen(false)
      setIsOpen(false)
      router.push('/dashboard')
    })
  }

  return (
    <>
      {/* Painel principal - melhorado para mobile */}
      <div className="panel rounded-xl border p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Workspace</p>
            <h2 className="text-lg font-semibold text-text-strong truncate">{workspace.name}</h2>
            {workspace.description && (
              <p className="text-sm text-text-muted mt-1 line-clamp-2">{workspace.description}</p>
            )}
          </div>

          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-2 w-full sm:w-auto justify-center"
            onClick={openSettings}
          >
            <Settings2 className="size-4" /> Configurações
          </button>
        </div>

        {/* Cards de estatísticas - responsivos */}
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
          <div className="rounded-xl border border-border bg-surface-muted p-3 text-center sm:text-left">
            <p className="text-xs font-medium text-text-muted">Notas</p>
            <p className="text-lg font-semibold text-text-strong">{noteCount}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface-muted p-3 text-center sm:text-left">
            <p className="text-xs font-medium text-text-muted">Flashcards</p>
            <p className="text-lg font-semibold text-text-strong">{flashcardCount}</p>
          </div>
          <div className="col-span-2 sm:col-span-1 rounded-xl border border-border bg-surface-muted p-3 text-center sm:text-left">
            <p className="text-xs font-medium text-text-muted">Status</p>
            <p className="text-lg font-semibold text-text-strong">
              {isArchived ? 'Arquivado' : 'Ativo'}
            </p>
          </div>
        </div>

        {message && (
          <div className={`mt-4 text-sm flex items-center gap-2 ${message.type === 'error' ? 'text-error' : 'text-success'}`}>
            <span>{message.text}</span>
            <button onClick={() => setMessage(null)} className="shrink-0 hover:opacity-70">
              <X className="size-4" />
            </button>
          </div>
        )}
      </div>

      {/* Modal de Configurações */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="panel w-full max-w-3xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-text-strong">Configurações do workspace</h3>
                <p className="text-sm text-text-muted mt-1">
                  Edite o nome, a descrição ou gerencie o estado deste workspace.
                </p>
              </div>
              <button onClick={() => setIsOpen(false)} className="icon-button self-end sm:self-start" aria-label="Fechar">
                <X className="size-5" />
              </button>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.8fr_1fr]">
              <div className="space-y-5">
                <div>
                  <label className="text-sm font-medium text-text-strong block mb-2">Nome do workspace</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="field w-full"
                    placeholder="Digite o nome..."
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-text-strong block mb-2">Descrição</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="field w-full min-h-[100px] resize-y"
                    placeholder="Descreva o propósito deste workspace..."
                    rows={3}
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={handleSave} disabled={isPending} className="btn-primary flex-1 sm:flex-none">
                    {isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    {isPending ? 'Salvando...' : 'Salvar alterações'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { resetForm(); setIsOpen(false) }}
                    className="btn-ghost flex-1 sm:flex-none"
                  >
                    Cancelar
                  </button>
                </div>
              </div>

              {/* Sidebar de ações - empilhada em mobile */}
              <div className="space-y-4 rounded-xl border border-border bg-surface-muted p-4">
                <p className="text-sm font-semibold text-text-strong">Gerenciar</p>
                <div className="space-y-2 text-sm text-text-muted">
                  <div className="flex justify-between">
                    <span>Notas</span>
                    <span className="font-medium">{noteCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Flashcards</span>
                    <span className="font-medium">{flashcardCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Status</span>
                    <span className="font-medium">{isArchived ? 'Arquivado' : 'Ativo'}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsArchiveModalOpen(true)}
                  className="btn-secondary w-full gap-2 justify-center"
                  disabled={isPending}
                >
                  <Archive className="size-4" /> {isArchived ? 'Desarquivar' : 'Arquivar'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(true)}
                  className="btn-destructive w-full gap-2 justify-center"
                  disabled={isPending}
                >
                  <Trash2 className="size-4" /> Excluir workspace
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Arquivar/Desarquivar */}
      {isArchiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="panel w-full max-w-lg p-4 sm:p-6 animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            <div className="flex items-start gap-3">
              <Archive className="size-6 text-warning shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-text-strong">
                  {isArchived ? 'Desarquivar workspace' : 'Arquivar workspace'}
                </h3>
                <p className="text-sm text-text-muted mt-1">
                  {isArchived
                    ? 'Esse workspace será marcado como ativo novamente e aparecerá na lista principal.'
                    : 'Arquivar um workspace o remove da lista principal sem excluir os dados. Você pode desarquivá-lo a qualquer momento.'}
                </p>
              </div>
              <button onClick={() => setIsArchiveModalOpen(false)} className="icon-button" aria-label="Fechar">
                <X className="size-4" />
              </button>
            </div>

            <div className="my-4 rounded-lg bg-surface p-3 text-sm">
              <p><span className="text-text-muted">Workspace:</span> <strong>{workspace.name}</strong></p>
              <p><span className="text-text-muted">Notas:</span> <strong>{noteCount}</strong></p>
              <p><span className="text-text-muted">Flashcards:</span> <strong>{flashcardCount}</strong></p>
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-3">
              <button onClick={() => setIsArchiveModalOpen(false)} className="btn-ghost w-full sm:w-auto">
                Cancelar
              </button>
              <button onClick={handleArchive} className="btn-primary w-full sm:w-auto">
                {isArchived ? 'Desarquivar' : 'Arquivar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Exclusão com confirmação por nome */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="panel w-full max-w-lg p-4 sm:p-6 animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-6 text-error shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-text-strong">Excluir permanentemente</h3>
                <p className="text-sm text-text-muted mt-1">
                  Essa ação <strong className="text-error">não pode ser desfeita</strong>. Todos os dados (notas, flashcards, etc.) serão removidos.
                </p>
              </div>
              <button onClick={() => setIsDeleteModalOpen(false)} className="icon-button" aria-label="Fechar">
                <X className="size-4" />
              </button>
            </div>

            <div className="my-4 rounded-lg bg-surface p-3 text-sm">
              <p><span className="text-text-muted">Workspace:</span> <strong>{workspace.name}</strong></p>
              <p><span className="text-text-muted">Notas:</span> <strong>{noteCount}</strong></p>
              <p><span className="text-text-muted">Flashcards:</span> <strong>{flashcardCount}</strong></p>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-medium text-text-strong">
                Digite <span className="font-mono bg-surface-muted px-1 py-0.5 rounded">{workspace.name}</span> para confirmar:
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="field w-full"
                placeholder={`Digite "${workspace.name}"`}
                autoFocus
              />
            </div>

            <div className="mt-6 flex flex-col sm:flex-row justify-end gap-3">
              <button onClick={() => setIsDeleteModalOpen(false)} className="btn-ghost w-full sm:w-auto">
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteConfirmText !== workspace.name || isPending}
                className="btn-destructive w-full sm:w-auto"
              >
                {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Excluir workspace
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}