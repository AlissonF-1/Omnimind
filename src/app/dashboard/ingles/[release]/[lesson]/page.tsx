import { notFound, redirect } from 'next/navigation'
import { academyLessonHref, academySlug } from '@/lib/academy/contracts'
import type { LessonPageProps } from '@/components/academy/AcademyLessonScreen'

export default async function EnglishLessonPage({ params, searchParams }: LessonPageProps) {
  const [{ release, lesson }, query] = await Promise.all([params, searchParams])
  if (!academySlug.test(release) || !academySlug.test(lesson)) notFound()
  const review = query.revisao === '1'
  const target = academyLessonHref(release, lesson, review)
  if (!review && typeof query.atividade === 'string' && academySlug.test(query.atividade)) {
    const next = new URLSearchParams({ atividade: query.atividade })
    if (typeof query.etapa === 'string' && academySlug.test(query.etapa)) next.set('etapa', query.etapa)
    redirect(target + '?' + next + '#pratica')
  }
  if (!review && typeof query.etapa === 'string' && academySlug.test(query.etapa)) {
    redirect(target + '?' + new URLSearchParams({ etapa: query.etapa, ...(typeof query.secao === 'string' ? { secao: query.secao } : {}) }))
  }
  redirect(target)
}
