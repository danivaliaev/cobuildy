import { setConsent } from '../lib/consent'

/** Asks once. Declining keeps the funnel fully working: only the ad pixel stays off. */
export function ConsentBanner({ onChoose }: { onChoose: (granted: boolean) => void }) {
  const choose = (granted: boolean) => { setConsent(granted ? 'granted' : 'denied'); onChoose(granted) }
  return (
    <div className="consent" role="dialog" aria-label="Cookies" aria-live="polite">
      <p>We use a marketing cookie (Meta Pixel) to measure which ads bring useful visitors. It is off unless you accept. <a href="/privacy">Privacy policy</a></p>
      <div className="consent-btns">
        <button type="button" className="fn-ghost" onClick={() => choose(false)}>Decline</button>
        <button type="button" className="fn-cta" onClick={() => choose(true)}>Accept</button>
      </div>
    </div>
  )
}
