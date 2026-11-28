import Image from 'next/image'
import type { AcademyResource } from '@/lib/academy/contracts'
import { AcademyAudio } from './AcademyAudio'

export function ExerciseResource({ resource, audioLabel }: { resource?: AcademyResource; audioLabel?: string }) {
  if (!resource) return null
  if (resource.type === 'audio') return <AcademyAudio key={resource.path} src={resource.path}
    label={audioLabel ?? 'áudio da atividade'} />
  if (!resource.width || !resource.height) return null
  return <figure className="ac-exercise-media">
    <Image src={resource.path} width={resource.width} height={resource.height} alt={resource.alt}
      sizes="(max-width: 760px) 90vw, 520px" />
    {resource.caption && <figcaption>{resource.caption}</figcaption>}
  </figure>
}
