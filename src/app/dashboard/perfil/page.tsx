import ProfilePanel from '@/components/ProfilePanel'
import { getProfileStats } from '@/actions/stats'
import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

function ProfileLoading() {
  return (
    <div className="flex h-[50vh] items-center justify-center">
      <Loader2 className="size-8 animate-spin text-primary" />
    </div>
  )
}

export default async function ProfilePage() {
  const profileStats = await getProfileStats()

  return (
    <div className="page-container px-4 sm:px-6 py-4 sm:py-6">
      <header className="mb-6 border-b border-border/50 pb-4 sm:pb-5">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-medium text-primary">Meu Perfil</p>
        </div>
        <h1 className="page-title text-2xl sm:text-3xl">Estatísticas & Progresso</h1>
      </header>

      <Suspense fallback={<ProfileLoading />}>
        <ProfilePanel initialData={profileStats} />
      </Suspense>
    </div>
  )
}
