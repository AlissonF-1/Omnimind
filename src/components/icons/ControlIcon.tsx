import { forwardRef, type ReactNode } from 'react'
import { IconFrame, type IconProps } from './IconFrame'

export function controlIcon(name: string, artwork: ReactNode, viewBox = '0 0 24 24', family: 'solar' | 'omnimind' = 'solar') {
  const Icon = forwardRef<SVGSVGElement, IconProps>(function ControlIcon(props, ref) {
    return <IconFrame fill="currentColor" {...props} ref={ref} name={name} family={family} viewBox={viewBox}>
      {artwork}
    </IconFrame>
  })
  Icon.displayName = `ControlIcon(${name})`
  return Icon
}
