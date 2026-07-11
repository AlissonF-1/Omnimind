import Sidebar from '@/components/Sidebar'
import { getWorkspaces } from '@/actions/workspaces'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const workspaces = await getWorkspaces()

  return (
    <div className="app-shell">
      <Sidebar workspaces={workspaces} />
      {/*
        h-screen garante que o main sempre ocupe a altura da viewport.
        Isso permite que filhos com h-full (como o ChatPanel) se ancorem
        corretamente sem depender de altura fixa.
        overflow-y-auto mantém o scroll nas páginas normais.
      */}
      <main className="flex-1 h-screen overflow-y-auto px-5 py-6 pt-20 md:px-8 md:py-8">
        {children}
      </main>
    </div>
  )
}