import './lab.css'

export const dynamic = 'force-dynamic'

export default function SqlLabLayout({ children }: { children: React.ReactNode }) {
  return <div className="sl-shell">{children}</div>
}
