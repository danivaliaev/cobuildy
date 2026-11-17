import { setConsent } from '../lib/consent'
import { FUNNEL } from '../i18n/funnel'
import type { Lang } from '../i18n'

/** Asks once. Declining keeps the funnel fully working: only the ad pixel stays off. */
export function ConsentBanner({ onChoose, lang = 'en' }: { onChoose: (granted: boolean) => void; lang?: Lang }) {
  const L = FUNNEL[lang]
  const choose = (granted: boolean) => { setConsent(granted ? 'granted' : 'denied'); onChoose(granted) }
  return (
    <div className="consent" role="dialog" aria-label={L.cookiesAria} aria-live="polite">
      <p>{L.consent} <a href={lang === 'es' ? '/es/privacy' : '/privacy'}>{L.consentLink}</a></p>
      <div className="consent-btns">
        <button type="button" className="fn-ghost" onClick={() => choose(false)}>{L.decline}</button>
        <button type="button" className="fn-cta" onClick={() => choose(true)}>{L.accept}</button>
      </div>
    </div>
  )
}
