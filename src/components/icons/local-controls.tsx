import { controlIcon } from './ControlIcon'

const grid = '0 0 24 24'

export const Loader2 = /* @__PURE__ */ controlIcon('loader',
  <>
    <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" opacity=".22" strokeWidth="2.4" />
    <path d="M12 4a8 8 0 0 1 8 8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
  </>, grid, 'omnimind')
export const LoaderCircle = Loader2

export const Heading2 = /* @__PURE__ */ controlIcon('heading-2',
  <path d="M3 5h2v6h6V5h2v14h-2v-6H5v6H3zm12.5 7a3 3 0 0 1 6 0c0 1.3-.7 2.1-1.7 3l-2.2 2h4v2h-6.4v-1.7l3.3-3.3c.6-.6 1-1.1 1-1.9a1 1 0 0 0-2 0Z" />,
  grid, 'omnimind')

export const Sigma = /* @__PURE__ */ controlIcon('formula',
  <>
    <path d="M16 5H5l7 7-7 7h13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16 6h3v3h-3zm0 9h3v3h-3z" opacity=".35" />
  </>, grid, 'omnimind')

export const Swords = /* @__PURE__ */ controlIcon('duel',
  <>
    <path d="M4 3h4l12 13-3 3L4 7zm16 0h-4l-4 4 3 3 5-5zM9 13l3 3-6 5-3-3z" opacity=".42" />
    <path d="m13 20 7-7m-2 4 3 4M3 13l7 7m-4-4-3 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </>, grid, 'omnimind')

export const WifiOff = /* @__PURE__ */ controlIcon('offline',
  <>
    <path d="M3 9a14 14 0 0 1 6-3m5 0c2.6.4 5 1.4 7 3m-15 4a10 10 0 0 1 4-2m4 0a10 10 0 0 1 4 2m-9 4a4 4 0 0 1 6 0"
      fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" opacity=".52" />
    <path d="m3 3 18 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    <circle cx="12" cy="21" r="1" />
  </>, grid, 'omnimind')

export const GitMerge = /* @__PURE__ */ controlIcon('merge',
  <>
    <path d="M7 8v8m0-7a7 7 0 0 0 7 7h2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    <circle cx="7" cy="5" r="2.7" /><circle cx="7" cy="19" r="2.7" opacity=".48" /><circle cx="19" cy="16" r="2.7" />
  </>, grid, 'omnimind')
