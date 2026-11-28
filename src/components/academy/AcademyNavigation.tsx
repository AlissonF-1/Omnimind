'use client'

import { AcademyIcon, CompetenciesIcon, EnglishIcon, Home, LearningPathIcon, MissionsIcon, TechnologyIcon } from '@/components/icons'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { academyPath } from '@/lib/academy/contracts'
import { practicePath } from '@/lib/academy/practice'
import { journeyPath, skillsPath } from '@/lib/academy/presentation'

export function AcademyNavigation({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname()
  const track = useSearchParams().get('track')
  const isJourney = pathname === journeyPath
  return <nav className="ac3-rail-nav" aria-label="Navegação da Academy">
    <p>Ambiente de estudo</p>
    <Link onClick={onNavigate} href={academyPath} aria-current={pathname === academyPath ? 'page' : undefined}><Home size={17} aria-hidden="true" /> Visão geral</Link>
    <Link onClick={onNavigate} href={journeyPath} prefetch={false} aria-current={isJourney && !track ? 'page' : undefined}><LearningPathIcon size={19} aria-hidden="true" /> Minha jornada</Link>
    <Link onClick={onNavigate} href={skillsPath} prefetch={false} aria-current={pathname === skillsPath ? 'page' : undefined}><CompetenciesIcon size={19} aria-hidden="true" /> Competências</Link>
    <Link onClick={onNavigate} href={practicePath} prefetch={false} aria-current={pathname.startsWith(practicePath) ? 'page' : undefined}><MissionsIcon size={19} aria-hidden="true" /> Práticas</Link>
    <p>Formações</p>
    <Link onClick={onNavigate} href={journeyPath + '?track=tech'} prefetch={false} data-track="tech"
      aria-current={isJourney && track === 'tech' ? 'page' : undefined}><TechnologyIcon size={19} aria-hidden="true" /> OmniMind Tech</Link>
    <Link onClick={onNavigate} href={journeyPath + '?track=english'} prefetch={false} data-track="english"
      aria-current={isJourney && track === 'english' ? 'page' : undefined}><EnglishIcon size={19} aria-hidden="true" /> OmniMind English</Link>
  </nav>
}

export function AcademyNavigationFallback() {
  return <nav className="ac3-rail-nav" aria-label="Navegação da Academy">
    <Link href={academyPath}><AcademyIcon size={19} aria-hidden="true" /> Visão geral</Link>
  </nav>
}
