'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

const oldAnchors = {
  '#aprender': 'aprender', '#experimentar': 'experimentar', '#laboratorio': 'experimentar',
  '#escutar': 'escutar', '#vocabulario': 'expressoes', '#expressoes': 'expressoes',
  '#pratica': 'praticar', '#aplicacao': 'aplicacao',
} as const

export function LessonAnchorCompatibility({ tabs }: { tabs: readonly string[] }) {
  const router = useRouter()
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.has('etapa') || url.searchParams.has('atividade') || url.searchParams.has('revisao')) return
    const stage = oldAnchors[url.hash as keyof typeof oldAnchors]
    if (!stage || !tabs.includes(stage)) return
    url.searchParams.set('etapa', stage)
    router.replace(url.pathname + url.search, { scroll: false })
  }, [router, tabs])
  return null
}
