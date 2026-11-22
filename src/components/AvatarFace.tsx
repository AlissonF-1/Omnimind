'use client'

import { useState } from 'react'
import Image from 'next/image'
import { AVATAR_ICONS } from '@/utils/avatars'

export default function AvatarFace({ name, avatarIcon, avatarUrl, size }: {
  name: string
  avatarIcon?: string | null
  avatarUrl: string | null
  size: number
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const Icon = avatarIcon && Object.hasOwn(AVATAR_ICONS, avatarIcon)
    ? AVATAR_ICONS[avatarIcon as keyof typeof AVATAR_ICONS]
    : null

  if (Icon) return <Icon className="h-[52%] w-[52%]" aria-hidden="true" />

  if (avatarUrl && failedUrl !== avatarUrl) {
    return (
      <Image src={avatarUrl} alt="" width={size} height={size} unoptimized referrerPolicy="no-referrer"
        onError={() => setFailedUrl(avatarUrl)} className="size-full object-cover"
      />
    )
  }

  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase()
  return <span aria-hidden="true">{initials}</span>
}
