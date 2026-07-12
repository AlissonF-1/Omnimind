'use client' // Transformamos em Client Component para garantir a segurança no mobile

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { MessageSquare, Loader2, AlertCircle } from 'lucide-react'
import ChatPanel from '@/components/ChatPanel'
import { Suspense } from 'react'

// Componente que SÓ renderiza no celular/PC depois do carregamento
function ClientOnly({ children }: { children: React.ReactNode }) {
  const [hasMounted, setHasMounted] = useState(false)

  useEffect(() => {
    setHasMounted(true)
  }, [])

  if (!hasMounted) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="mt-4 text-sm text-text-muted">Preparando o ambiente...</p>
      </div>
    )
  }

  return <>{children}</>
}

// Um ErrorBoundary simples para evitar que o app feche se der erro
function ChatErrorFallback({ error }: { error: Error }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center p-6">
      <AlertCircle className="size-12 text-error" />
      <h2 className="mt-3 text-lg font-semibold text-text-strong">Algo deu errado</h2>
      <p className="mt-1 max-w-sm text-sm text-text-muted">
        Ocorreu um erro ao carregar o chat. Tente recarregar a página.
      </p>
      <code className="mt-4 max-w-full overflow-auto rounded bg-surface-muted p-2 text-xs text-error font-mono">
        {error.message || 'Erro desconhecido (verifique o console F12)'}
      </code>
    </div>
  )
}

function ChatPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()

  // Estado para armazenar a lista de workspaces
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Pega o workspaceId da URL (query string)
  const workspaceIdFromUrl = searchParams.get('workspaceId')
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(workspaceIdFromUrl || null)

  useEffect(() => {
    async function loadWorkspaces() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
          router.push('/login')
          return
        }

        // Carrega TODOS os workspaces do usuário
        const { data: workspacesData, error: wsError } = await supabase
          .from('workspaces')
          .select('id, name')
          .eq('user_id', user.id)
          .order('name', { ascending: true })

        if (wsError || !workspacesData) {
          setError(new Error('Erro ao carregar workspaces'))
          return
        }

        setWorkspaces(workspacesData)

        // Se a URL não tiver um ID, define o primeiro workspace como ativo
        if (!activeWorkspaceId && workspacesData.length > 0) {
          setActiveWorkspaceId(workspacesData[0].id)
          router.replace(`/dashboard/chat?workspaceId=${workspacesData[0].id}`)
        }

      } catch (err: any) {
        setError(err)
      } finally {
        setIsLoading(false)
      }
    }

    loadWorkspaces()
  }, [router, supabase, activeWorkspaceId])

  // Atualiza o estado se a URL mudar manualmente
  useEffect(() => {
    if (workspaceIdFromUrl) {
      setActiveWorkspaceId(workspaceIdFromUrl)
    }
  }, [workspaceIdFromUrl])

  if (error) {
    return <ChatErrorFallback error={error} />
  }

  if (isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="mt-4 text-sm text-text-muted">Carregando seus workspaces...</p>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col px-4 sm:px-6 py-4 sm:py-6">
      {/* Cabeçalho do chat */}
      <header className="mb-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-5 text-primary" />
          <h1 className="text-lg font-semibold text-text-strong">Assistente</h1>
          <span className="inline-flex items-center gap-1 text-xs font-medium bg-success-soft/30 text-success px-2.5 py-0.5 rounded-full border border-success/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
            </span>
            Online
          </span>
        </div>
      </header>

      {/* ChatPanel protegido */}
      <div className="flex-1 min-h-0 relative">
        <ChatPanel 
          workspaceId={activeWorkspaceId || undefined} 
          workspaces={workspaces} 
          onWorkspaceChange={(newId: string) => router.replace(`/dashboard/chat?workspaceId=${newId}`)}
        />
      </div>
    </div>
  )
}

export default function ChatPage() {
  return (
    <ClientOnly>
      <Suspense fallback={
        <div className="flex h-full flex-col items-center justify-center py-20">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="mt-4 text-sm text-text-muted">Carregando chat...</p>
        </div>
      }>
        <ChatPageContent />
      </Suspense>
    </ClientOnly>
  )
}