import { forwardRef, useId, type CSSProperties } from 'react'
import { IconFrame, type IconProps } from './IconFrame'
import { iconRegistry, type OmniIconName } from './icon-registry'

export type ProductIconProps = IconProps & { mode?: 'mono' | 'duotone' | 'color' }
type OmniIconProps = ProductIconProps & { name: OmniIconName }

export const OmniIcon = forwardRef<SVGSVGElement, OmniIconProps>(function OmniIcon(
  { name, mode = 'duotone', strokeWidth, style, ...props }, ref,
) {
  const uid = `omni-${useId().replace(/[^a-zA-Z0-9_-]/g, '_')}`
  const { palette, lightPalette, paths } = iconRegistry[name]
  const colors = mode === 'color' ? {
    '--omni-dark-start': palette[0], '--omni-dark-end': palette[1], '--omni-dark-accent': palette[2],
    '--omni-light-start': lightPalette[0], '--omni-light-end': lightPalette[1], '--omni-light-accent': lightPalette[2],
    ...style,
  } as CSSProperties : style
  const paint = mode === 'color' ? `url(#${uid})` : 'currentColor'
  const accent = mode === 'color' ? 'var(--omni-accent)' : 'currentColor'
  const width = strokeWidth === undefined ? 2.7 : 2 * Number(strokeWidth)

  return <IconFrame {...props} ref={ref} name={name} family="omnimind" viewBox="0 0 48 48" style={colors}
    fill="none" strokeLinecap="round" strokeLinejoin="round" data-icon-mode={mode}>
    {mode === 'color' && <defs>
      <linearGradient id={uid} x1="4" y1="3" x2="44" y2="45" gradientUnits="userSpaceOnUse">
        <stop stopColor="var(--omni-start)" />
        <stop offset="1" stopColor="var(--omni-end)" />
      </linearGradient>
    </defs>}
    {paths.map(({ d, role }) => <path key={d} d={d}
      fill={role === 'soft' && mode !== 'mono' ? paint : role === 'solid' ? paint : role === 'accent' ? accent : 'none'}
      fillOpacity={role === 'soft' ? 0.22 : undefined}
      stroke={role === 'soft' || role === 'line' ? paint : role === 'accentLine' ? accent : undefined}
      strokeWidth={role === 'accentLine' ? width + 0.4 : width} />)}
  </IconFrame>
})

export function productIcon(name: OmniIconName) {
  const Icon = forwardRef<SVGSVGElement, ProductIconProps>(function ProductIcon(props, ref) {
    return <OmniIcon {...props} ref={ref} name={name} />
  })
  Icon.displayName = `OmniIcon(${name})`
  return Icon
}
