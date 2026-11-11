import { useMemo, useState, type FormEvent } from 'react'
import { COUNTRIES, KINDS, validPhone, type Kind } from '../lib/investorKinds'
import { ErrorLine } from './ui'

export interface InvestorProfileValue { kind: Kind | ''; country: string; name: string; phone: string }

/** Type first, then country, then the name and phone. Used at sign-up, in the banner and in the Mandate tab. */
export function InvestorProfileForm({ initial, submitLabel, busy, error, onSubmit, onCancel }: {
  initial?: Partial<InvestorProfileValue>; submitLabel: string; busy: boolean; error: string | null
  onSubmit: (v: InvestorProfileValue & { kind: Kind }) => void; onCancel?: () => void
}) {
  const [kind, setKind] = useState<Kind | ''>(initial?.kind ?? '')
  const [country, setCountry] = useState(initial?.country ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const countries = useMemo(COUNTRIES, [])
  const k = KINDS.find(x => x.k === kind)
  const phoneBad = phone.trim() !== '' && !validPhone(phone)
  const ok = !!k && !!country && name.trim() !== '' && validPhone(phone)
  const submit = (e: FormEvent) => { e.preventDefault(); if (ok && k) onSubmit({ kind: k.k, country, name: name.trim(), phone: phone.trim() }) }
  return (
    <form className="ipf" onSubmit={submit}>
      <div className="kinds" role="radiogroup" aria-label="Investor type">
        {KINDS.map(x => (
          <button key={x.k} type="button" role="radio" aria-checked={kind === x.k} className={`kind ${kind === x.k ? 'on' : ''}`} onClick={() => setKind(x.k)}>
            <b>{x.label}</b><span>{x.hint}</span>
          </button>))}
      </div>
      <label className="f"><span>Country</span>
        <select required value={country} onChange={e => setCountry(e.target.value)} disabled={!kind}>
          <option value="">{kind ? 'Choose a country' : 'Choose a type first'}</option>
          {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select></label>
      <label className="f"><span>{k?.nameLabel ?? 'Name'}</span>
        <input required maxLength={160} value={name} onChange={e => setName(e.target.value)} autoComplete="organization" disabled={!kind} /></label>
      <label className="f"><span>Phone</span>
        <input required type="tel" maxLength={30} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+34 600 123 456" autoComplete="tel" aria-invalid={phoneBad} />
        {phoneBad && <small className="muted">Enter a valid number with country code.</small>}</label>
      <p className="muted small">Developers see only your type and country. Your name and phone stay with Cobuildy until you choose to open a data room.</p>
      <ErrorLine error={error} />
      <div className="row"><button className="btn pri" type="submit" disabled={busy || !ok}>{busy ? 'Saving…' : submitLabel}</button>
        {onCancel && <button className="btn" type="button" onClick={onCancel}>Cancel</button>}</div>
    </form>
  )
}
