import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="adm-head">
      <div><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>
      {children && <div className="row">{children}</div>}
    </header>
  )
}

export function Kpi({ label, value, hint, to, tone }: { label: string; value: ReactNode; hint?: ReactNode; to?: string; tone?: 'warn' | 'good' }) {
  const inner = <><span className="mono">{label}</span><b className={tone ?? ''}>{value}</b>{hint && <span className="muted">{hint}</span>}</>
  return to ? <Link className="kpi link" to={to}>{inner}</Link> : <div className="kpi">{inner}</div>
}

/** Sub-navigation inside a page; each tab is a real address, so it can be linked and the back button works. */
export function Tabs({ items }: { items: Array<{ to: string; label: string; n?: number }> }) {
  return (
    <nav className="adm-tabs" aria-label="Sections">
      {items.map(t => <NavLink key={t.to} to={t.to} end className={({ isActive }) => (isActive ? 'on' : '')}>{t.label}{t.n ? <em className="adm-badge">{t.n}</em> : null}</NavLink>)}
    </nav>
  )
}

export const num = (n: number) => n.toLocaleString('en-GB')
