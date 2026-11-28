import { forwardRef, type SVGProps } from 'react'

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'width' | 'height' | 'viewBox'> & {
  size?: number | string
  label?: string
}

type FrameProps = IconProps & { viewBox: string; name: string; family: 'omnimind' | 'solar' }

export const IconFrame = forwardRef<SVGSVGElement, FrameProps>(function IconFrame(
  { size = 24, label, name, family, className, children, role, 'aria-label': ariaLabel, 'aria-labelledby': labelledBy,
    'aria-hidden': hidden, ...props }, ref,
) {
  const accessibleName = label ?? ariaLabel
  const informative = Boolean(accessibleName || labelledBy)

  return <svg {...props} ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size}
    focusable="false" role={role ?? (informative ? 'img' : undefined)} aria-label={accessibleName}
    aria-labelledby={labelledBy} aria-hidden={hidden ?? (informative ? undefined : true)}
    data-icon={name} data-icon-family={family} className={className ? `omni-icon ${className}` : 'omni-icon'}>
    {children}
  </svg>
})
