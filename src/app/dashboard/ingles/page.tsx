import { redirect } from 'next/navigation'
import { journeyPath } from '@/lib/academy/presentation'

export default function EnglishHomePage() {
  redirect(journeyPath + '?track=english')
}
