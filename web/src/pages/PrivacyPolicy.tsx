import { useEffect } from 'react'

/** Public privacy and cookie notice. Linked from the ad funnel and its consent banner. */
export function PrivacyPolicy() {
  useEffect(() => { document.title = 'Privacy and cookies · Cobuildy' }, [])
  return (
    <div className="legal-page">
      <header className="fn-top"><a className="fn-logo" href="/">Cobuildy</a></header>
      <main>
        <h1>Privacy and cookies</h1>
        <p className="muted">Last updated 17 November 2026</p>

        <h2>Who we are</h2>
        <p>Cobuildy S.L., Carrer de Calàbria 149, Entresòl 1a, 08015 Barcelona, Spain. Contact for anything about your data: <a href="mailto:info@cobuildy.com">info@cobuildy.com</a>. We are the controller of the data described here.</p>

        <h2>What we collect and why</h2>
        <ul>
          <li><b>Your answers about a project</b> (type, location, stage, sales value, capital sought, permits). We use them to produce your funding assessment and to match the project with investors. Basis: taking the steps you ask for.</li>
          <li><b>Your name and phone number</b>, when you give them in the funnel. We use them to save your results, to contact you about this project and to help if something goes wrong. Basis: taking the steps you ask for, and our legitimate interest in following up a request you made.</li>
          <li><b>Where you came from</b>: the advertising tags in the link (for example the campaign name), whether the click came from Meta, and the referring site. We use them to see which ads bring useful visitors. We store this with your answers.</li>
          <li><b>Account data</b>, if you create an account: email and the profile you fill in.</li>
        </ul>

        <h2>Cookies and similar storage</h2>
        <table className="legal-table">
          <thead><tr><th>Name</th><th>Purpose</th><th>Type</th></tr></thead>
          <tbody>
            <tr><td>cb.funnel.sid</td><td>Random visit id, so your answers are not lost if you reload</td><td>Necessary, no consent needed</td></tr>
            <tr><td>cb.consent.v1</td><td>Remembers your cookie choice</td><td>Necessary, no consent needed</td></tr>
            <tr><td>Sign-in session</td><td>Keeps you signed in after you create an account</td><td>Necessary, no consent needed</td></tr>
            <tr><td>Meta Pixel (_fbp, _fbc)</td><td>Tells Meta that a visit or a request came from an ad, to measure and improve ads</td><td>Marketing, only if you accept</td></tr>
          </tbody>
        </table>
        <p>If you decline, the Meta Pixel is not loaded and the funnel works the same. You can change your choice by clearing this site’s data in your browser; the banner then appears again.</p>

        <h2>Who receives your data</h2>
        <ul>
          <li>Our hosting and database providers, who process data for us under contract.</li>
          <li>Investors, but only the project details you choose to share through your account, never from the funnel alone.</li>
          <li>Meta Platforms Ireland Ltd, only if you accept marketing cookies. Meta acts as a joint controller for the pixel data it receives.</li>
        </ul>
        <p>We do not sell personal data.</p>

        <h2>How long we keep it</h2>
        <p>Funnel answers and contact details are kept while we may still help with your project and for a reasonable time after, and then deleted or made anonymous. Ask us earlier and we delete them sooner, unless the law requires us to keep something.</p>

        <h2>Your rights</h2>
        <p>You can ask us for access to your data, to correct or delete it, to limit or object to its use, to receive a copy, and to withdraw consent at any time. Write to <a href="mailto:info@cobuildy.com">info@cobuildy.com</a>. You can also complain to your data protection authority: the Agencia Española de Protección de Datos (aepd.es) in Spain or the Comissão Nacional de Proteção de Dados (cnpd.pt) in Portugal.</p>

        <h2>What Cobuildy is not</h2>
        <p>Cobuildy S.L. is an introducer between real estate developers and investors. It is not a financial adviser, does not provide investment advice and does not hold client funds. The funding assessment is an indication based on your answers, not a credit decision or a promise of funding.</p>
      </main>
    </div>
  )
}
