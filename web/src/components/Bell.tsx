import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'

export interface Note { id: string; kind: string; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null }

export function ago(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return d < 7 ? `${d} d ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** Notification bell: unread count, list of the latest 30, click opens the related screen. Refreshes every 30 seconds and when the tab regains focus. */
export function Bell() {
  const { profile } = useAuth()
  const nav = useNavigate()
  const [notes, setNotes] = useState<Note[]>([])
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const load = useCallback(async () => {
    const { data } = await supabase.from('notifications').select('id,kind,title,body,link,created_at,read_at').order('created_at', { ascending: false }).limit(30)
    if (Array.isArray(data)) setNotes(data as Note[])
  }, [])
  useEffect(() => {
    if (!profile) return
    void load()
    const t = setInterval(() => void load(), 30000)
    const f = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', f)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', f) }
  }, [profile, load])
  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', out); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc) }
  }, [open])
  const unread = notes.filter(n => !n.read_at).length
  const mark = async (ids: string[]) => {
    if (!ids.length) return
    const at = new Date().toISOString()
    setNotes(ns => ns.map(n => (ids.includes(n.id) ? { ...n, read_at: at } : n)))
    await supabase.from('notifications').update({ read_at: at }).in('id', ids)
  }
  const go = (n: Note) => { void mark([n.id]); setOpen(false); if (n.link) nav(n.link) }
  return (
    <div className="bell" ref={box}>
      <button type="button" className="btn sm bellbtn" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
        {unread > 0 && <span className="bdot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="bpanel" role="dialog" aria-label="Notifications">
          <div className="row"><b>Notifications</b><span className="sp" />
            <button className="linkbtn" type="button" disabled={!unread} onClick={() => void mark(notes.filter(n => !n.read_at).map(n => n.id))}>Mark all read</button></div>
          {notes.length === 0 ? <p className="muted">Nothing yet. Updates on your projects and deals appear here.</p> : notes.map(n => (
            <button key={n.id} type="button" className={`bitem ${n.read_at ? '' : 'new'}`} onClick={() => go(n)}>
              <i aria-hidden="true" /><span><b>{n.title}</b>{n.body && <span className="s">{n.body}</span>}<span className="t">{ago(n.created_at)}</span></span></button>))}
        </div>)}
    </div>
  )
}
