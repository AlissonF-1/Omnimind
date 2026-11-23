'use client'

import { useEffect, useState } from 'react'
import { assistantAccountMatches } from '@/lib/assistant/contracts'
import { createClient } from '@/utils/supabase/client'

type Identity = { id: string; firstName: string }

export function useAssistantIdentity(accountId: string) {
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    const client = createClient()
    let stopped = false
    let revision = 0

    async function verify() {
      const current = ++revision
      const user = await client.auth.getUser().then(({ data, error }) => error ? null : data.user).catch(() => null)
      if (stopped || current !== revision) return
      if (assistantAccountMatches(accountId, user?.id ?? null) && user) {
        const fullName: unknown = user.user_metadata?.full_name
        const name = typeof fullName === 'string' ? fullName.trim().split(/\s+/)[0] : undefined
        setIdentity({ id: accountId, firstName: name?.slice(0, 42) || 'estudante' })
      } else {
        setIdentity(null)
      }
      setChecked(true)
    }

    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return
      if (!assistantAccountMatches(accountId, session?.user.id ?? null)) {
        revision++
        setIdentity(null)
        setChecked(true)
      } else if (event === 'SIGNED_IN') {
        setTimeout(() => { if (!stopped) void verify() }, 0)
      }
    })
    function recheckWhenVisible() {
      if (document.visibilityState === 'visible') void verify()
    }
    function invalidate() {
      revision++
      setIdentity(null)
      setChecked(true)
    }
    void verify()
    window.addEventListener('focus', recheckWhenVisible)
    window.addEventListener('assistant-session-invalid', invalidate)
    document.addEventListener('visibilitychange', recheckWhenVisible)
    return () => {
      stopped = true
      subscription.unsubscribe()
      window.removeEventListener('focus', recheckWhenVisible)
      window.removeEventListener('assistant-session-invalid', invalidate)
      document.removeEventListener('visibilitychange', recheckWhenVisible)
    }
  }, [accountId])

  return { identity: identity?.id === accountId ? identity : null, checked }
}
