export const ULTIMATUM_HREF = '/dashboard/revisoes?mode=ultimato'

export function isDashboardRoute(pathname: string, href: string) {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'))
}
