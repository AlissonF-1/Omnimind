import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { Settings } from 'lucide-react'
import SettingsTabs from '@/components/settings/SettingsTabs'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Configurações | OmniMind',
  description: 'Ajuste o comportamento da Inteligência Artificial, Gamificação e Privacidade.',
}

export default async function ConfiguracoesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="page-container animate-in fade-in duration-300 px-4 sm:px-6 py-4 sm:py-6" id="configuracoes-page">
      <header className="mb-6 flex items-center gap-3">
        <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-xl ring-1 ring-amber-500/25">
          <Settings className="size-6" />
        </div>
        <div>
          <h1 className="page-title text-2xl sm:text-3xl font-extrabold text-text-strong" id="page-main-title">
            Central de Configurações
          </h1>
          <p className="page-subtitle text-xs text-text-muted mt-0.5">
            Personalize seu espaço de estudos e o comportamento do assistente.
          </p>
        </div>
      </header>

      <main>
        <SettingsTabs />
      </main>
    </div>
  )
}
