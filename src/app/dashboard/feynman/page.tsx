import { getWorkspaces } from '@/actions/workspaces'
import FeynmanSandbox from '@/components/FeynmanSandbox'
import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function FeynmanPage() {
  const workspaces = await getWorkspaces()
  const activeWorkspaces = workspaces?.filter((w: any) => !w.is_archived) || []

  return (
    <div className="page-container max-w-4xl px-4 sm:px-6 py-4 sm:py-6">
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      }>
        <FeynmanSandbox workspaces={activeWorkspaces} />
      </Suspense>
    </div>
  )
}
