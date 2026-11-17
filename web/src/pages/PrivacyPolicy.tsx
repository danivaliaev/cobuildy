import { useEffect } from 'react'
import { otherLangHref, useLang } from '../i18n'

/** Public privacy and cookie notice, in English and Spanish. Linked from the ad funnel and its consent banner. */
export function PrivacyPolicy() {
  const lang = useLang()
  const es = lang === 'es'
  useEffect(() => { document.title = es ? 'Privacidad y cookies · Cobuildy' : 'Privacy and cookies · Cobuildy' }, [es])
  const mail = <a href="mailto:info@cobuildy.com">info@cobuildy.com</a>
  return (
    <div className="legal-page">
      <header className="fn-top">
        <a className="fn-logo" href={es ? '/es' : '/'}>Cobuildy</a>
        <nav className="fn-lang" aria-label="Language">
          {(['en', 'es'] as const).map(l => l === lang ? <b key={l} aria-current="true">{l.toUpperCase()}</b> : <a key={l} href={otherLangHref(l)} hrefLang={l}>{l.toUpperCase()}</a>)}
        </nav>
      </header>
      {es ? (
        <main>
          <h1>Privacidad y cookies</h1>
          <p className="muted">Última actualización: 17 de noviembre de 2026</p>

          <h2>Quiénes somos</h2>
          <p>Cobuildy S.L., Carrer de Calàbria 149, Entresòl 1a, 08015 Barcelona, España. Contacto para cualquier asunto sobre tus datos: {mail}. Somos el responsable del tratamiento de los datos descritos aquí.</p>

          <h2>Qué datos recogemos y para qué</h2>
          <ul>
            <li><b>Tus respuestas sobre un proyecto</b> (tipo, ubicación, fase, valor de venta, capital que buscas, permisos). Las usamos para elaborar tu evaluación de financiación y para buscar inversores que encajen con el proyecto. Base jurídica: aplicar las medidas que solicitas.</li>
            <li><b>Tu nombre y tu teléfono</b>, cuando los facilitas en el cuestionario. Los usamos para guardar tus resultados, para contactarte sobre este proyecto y para ayudarte si algo falla. Base jurídica: aplicar las medidas que solicitas y nuestro interés legítimo en atender una solicitud que has hecho tú.</li>
            <li><b>De dónde vienes</b>: las etiquetas publicitarias del enlace (por ejemplo, el nombre de la campaña), si el clic viene de Meta y el sitio de origen. Las usamos para saber qué anuncios traen visitantes útiles y las guardamos junto con tus respuestas.</li>
            <li><b>Datos de cuenta</b>, si creas una: correo electrónico y el perfil que completes.</li>
          </ul>

          <h2>Cookies y almacenamiento similar</h2>
          <table className="legal-table">
            <thead><tr><th>Nombre</th><th>Finalidad</th><th>Tipo</th></tr></thead>
            <tbody>
              <tr><td>cb.funnel.sid</td><td>Identificador aleatorio de la visita, para que no pierdas tus respuestas si recargas la página</td><td>Necesaria, no requiere consentimiento</td></tr>
              <tr><td>cb.consent.v1</td><td>Recuerda tu elección sobre las cookies</td><td>Necesaria, no requiere consentimiento</td></tr>
              <tr><td>cb.lang</td><td>Recuerda el idioma elegido</td><td>Necesaria, no requiere consentimiento</td></tr>
              <tr><td>Sesión de acceso</td><td>Mantiene tu sesión iniciada después de crear una cuenta</td><td>Necesaria, no requiere consentimiento</td></tr>
              <tr><td>Meta Pixel (_fbp, _fbc)</td><td>Indica a Meta que una visita o una solicitud procede de un anuncio, para medir y mejorar los anuncios</td><td>Marketing, solo si la aceptas</td></tr>
            </tbody>
          </table>
          <p>Si la rechazas, el Meta Pixel no se carga y el cuestionario funciona igual. Puedes cambiar tu elección borrando los datos de este sitio en tu navegador; el aviso volverá a aparecer.</p>

          <h2>Quién recibe tus datos</h2>
          <ul>
            <li>Nuestros proveedores de alojamiento y de base de datos, que tratan los datos por encargo nuestro y bajo contrato.</li>
            <li>Inversores, pero solo los datos del proyecto que decidas compartir desde tu cuenta, nunca a partir del cuestionario por sí solo.</li>
            <li>Meta Platforms Ireland Ltd, solo si aceptas las cookies de marketing. Meta actúa como corresponsable respecto a los datos del píxel que recibe.</li>
          </ul>
          <p>No vendemos datos personales.</p>

          <h2>Cuánto tiempo los conservamos</h2>
          <p>Las respuestas y los datos de contacto se conservan mientras podamos ayudarte con tu proyecto y durante un plazo razonable después; luego se eliminan o se anonimizan. Si nos lo pides antes, los eliminamos antes, salvo que la ley nos obligue a conservar algo.</p>

          <h2>Tus derechos</h2>
          <p>Puedes pedirnos acceso a tus datos, su rectificación o supresión, la limitación o la oposición al tratamiento, recibir una copia y retirar tu consentimiento en cualquier momento. Escríbenos a {mail}. También puedes presentar una reclamación ante tu autoridad de protección de datos: la Agencia Española de Protección de Datos (aepd.es) en España o la Comissão Nacional de Proteção de Dados (cnpd.pt) en Portugal.</p>

          <h2>Qué no es Cobuildy</h2>
          <p>Cobuildy S.L. es un intermediario entre promotores inmobiliarios e inversores. No es asesor financiero, no presta asesoramiento de inversión y no custodia fondos de clientes. La evaluación de financiación es una indicación basada en tus respuestas, no una decisión de crédito ni una promesa de financiación.</p>
        </main>
      ) : (
        <main>
          <h1>Privacy and cookies</h1>
          <p className="muted">Last updated 17 November 2026</p>

          <h2>Who we are</h2>
          <p>Cobuildy S.L., Carrer de Calàbria 149, Entresòl 1a, 08015 Barcelona, Spain. Contact for anything about your data: {mail}. We are the controller of the data described here.</p>

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
              <tr><td>cb.lang</td><td>Remembers the language you chose</td><td>Necessary, no consent needed</td></tr>
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
          <p>You can ask us for access to your data, to correct or delete it, to limit or object to its use, to receive a copy, and to withdraw consent at any time. Write to {mail}. You can also complain to your data protection authority: the Agencia Española de Protección de Datos (aepd.es) in Spain or the Comissão Nacional de Proteção de Dados (cnpd.pt) in Portugal.</p>

          <h2>What Cobuildy is not</h2>
          <p>Cobuildy S.L. is an introducer between real estate developers and investors. It is not a financial adviser, does not provide investment advice and does not hold client funds. The funding assessment is an indication based on your answers, not a credit decision or a promise of funding.</p>
        </main>
      )}
    </div>
  )
}
