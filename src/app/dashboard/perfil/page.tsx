import { Suspense } from 'react'
import ProfilePanel from '@/components/ProfilePanel'
import { getProfileStats } from '@/actions/stats'
import './profile.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Meu Perfil | OmniMind' }

async function ProfileContent() {
  const profile = await getProfileStats().catch(() => null)
  if (profile) return <ProfilePanel initialData={profile} />

  return (
    <section className="pf-panel pf-state">
      <h1>Meu perfil</h1>
      <p role="status">Não foi possível carregar o perfil.</p>
      <form action="/dashboard/perfil" method="get">
        <button type="submit" className="pf-button">Tentar novamente</button>
      </form>
    </section>
  )
}

export default function ProfilePage() {
  return (
    <div className="profile-page">
      <Suspense fallback={<p className="pf-panel pf-state" role="status">Carregando perfil…</p>}>
        <ProfileContent />
      </Suspense>
    </div>
  )
}
