import { useMemo, useState, type FormEvent } from 'react'
import { COUNTRIES, KINDS, validPhone, type Kind } from '../lib/investorKinds'
import { ErrorLine } from './ui'
import { useT, useLang } from '../i18n'

export interface InvestorProfileValue { kind: Kind | ''; country: string; name: string; phone: string }

/** Type first, then country, then the name and phone. Used at sign-up, in the banner and in the Mandate tab. */
export function InvestorProfileForm({ initial, submitLabel, busy, error, onSubmit, onCancel }: {
  initial?: Partial<InvestorProfileValue>; submitLabel: string; busy: boolean; error: string | null
  onSubmit: (v: InvestorProfileValue & { kind: Kind }) => void; onCancel?: () => void
}) {
  const t = useT(); const lang = useLang()
  const [kind, setKind] = useState<Kind | ''>(initial?.kind ?? '')
  const [country, setCountry] = useState(initial?.country ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const countries = useMemo(COUNTRIES, [lang])
  const k = KINDS.find(x => x.k === kind)
  const phoneBad = phone.trim() !== '' && !validPhone(phone)
  const ok = !!k && !!country && name.trim() !== '' && validPhone(phone)
  const submit = (e: FormEvent) => { e.preventDefault(); if (ok && k) onSubmit({ kind: k.k, country, name: name.trim(), phone: phone.trim() }) }
  return (
    <form className="ipf" onSubmit={submit}>
      <div className="kinds" role="radiogroup" aria-label={t('Investor type', 'Tipo de inversor')}>
        {KINDS.map(x => (
          <button key={x.k} type="button" role="radio" aria-checked={kind === x.k} className={`kind ${kind === x.k ? 'on' : ''}`} onClick={() => setKind(x.k)}>
            <b>{x.label}</b><span>{x.hint}</span>
          </button>))}
      </div>
      <label className="f"><span>{t('Country', 'País')}</span>
        <select required value={country} onChange={e => setCountry(e.target.value)} disabled={!kind}>
          <option value="">{kind ? t('Choose a country', 'Elige un país') : t('Choose a type first', 'Elige primero un tipo')}</option>
          {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select></label>
      <label className="f"><span>{k?.nameLabel ?? t('Name', 'Nombre')}</span>
        <input required maxLength={160} value={name} onChange={e => setName(e.target.value)} autoComplete="organization" disabled={!kind} /></label>
      <label className="f"><span>{t('Phone', 'Teléfono')}</span>
        <input required type="tel" maxLength={30} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+34 600 123 456" autoComplete="tel" aria-invalid={phoneBad} />
        {phoneBad && <small className="muted">{t('Enter a valid number with country code.', 'Introduce un número válido con prefijo del país.')}</small>}</label>
      <p className="muted small">{t('Developers see only your type and country. Your name and phone stay with Cobuildy until you choose to open a data room.', 'Los promotores solo ven tu tipo y tu país. Tu nombre y tu teléfono se quedan en Cobuildy hasta que decidas abrir un data room.')}</p>
      <ErrorLine error={error} />
      <div className="row"><button className="btn pri" type="submit" disabled={busy || !ok}>{busy ? t('Saving…', 'Guardando…') : submitLabel}</button>
        {onCancel && <button className="btn" type="button" onClick={onCancel}>{t('Cancel', 'Cancelar')}</button>}</div>
    </form>
  )
}
