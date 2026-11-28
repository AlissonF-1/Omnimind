import { redirect } from 'next/navigation'
import { SlidersHorizontal } from '@/components/icons'
import SettingsTabs from '@/components/settings/SettingsTabs'
import { createClient } from '@/utils/supabase/server'
import './settings.css'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Configurações | OmniMind',
  description: 'Ajuste suas preferências de estudo, aparência, áudio, assistente e dados.',
}

export default async function ConfiguracoesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="settings-page">
      <header className="st-hero">
        <span className="st-hero-icon"><SlidersHorizontal size={27} aria-hidden="true" /></span>
        <div>
          <h1>Configurações</h1>
          <p>Personalize como você estuda, usa o assistente e recebe avisos.</p>
        </div>
      </header>
      <SettingsTabs />
      <footer className="mt-5 text-sm text-text-muted">
        Ícones de interface por 480 Design.{' '}
        <a className="underline" href="https://icon-sets.iconify.design/solar/">Solar Icons</a>{' · '}
        <a className="underline" href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>
      </footer>
    </div>
  )
}
