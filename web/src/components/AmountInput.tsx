import { useEffect, useState } from 'react'
import { parseEuros } from '../lib/budget'

/** An amount in euros that is shown with thousands separators and read back when the field is left. Text that is not an amount is put back. */
export function AmountInput({ value, onChange, label, disabled, empty = '' }: { value: number | null | undefined; onChange: (n: number | null) => void; label: string; disabled?: boolean; empty?: string }) {
  const show = (n: number | null | undefined) => (n == null ? empty : Math.round(n).toLocaleString('en-GB'))
  const [text, setText] = useState(show(value))
  useEffect(() => { setText(show(value)) }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  const leave = () => {
    if (text.trim() === '') { setText(show(value)); if (empty === '' && value != null) onChange(null); return }
    const n = parseEuros(text)
    if (n == null) { setText(show(value)); return }
    setText(show(n))
    if (n !== value) onChange(n)
  }
  return <input className="amt" inputMode="decimal" aria-label={label} disabled={disabled} value={text} onChange={e => setText(e.target.value)} onBlur={leave} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
}
