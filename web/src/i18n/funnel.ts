import type { Lang } from './index'

/** Everything the ad funnel (/meta, /es/meta) says. Stored answers stay in English codes and labels (lib/funnel.ts); this is for the screen only. */
export interface FunnelText {
  title: string; h1: string; sub: (investors: number | null) => string; trust: string[]
  q: Record<'strategy' | 'geo' | 'stage' | 'gdv' | 'ask' | 'equity' | 'permit', string>
  moneyHint: string; checks: string[]
  strategy: Record<string, string>; stages: Record<string, Record<string, string>>; permits: Record<string, string>
  region: Record<string, string>; countries: Record<string, string>
  island: Record<string, string>
  noEquity: string; noEquityBtn: string; thousand: string; million: string
  cityAria: string; cityPlaceholder: string; next: string; cityBad: string; suggestions: string
  country: (place: string) => string; changePlace: string; otherCountry: (place: string) => string; placeIn: (place: string, country: string) => string; countryAria: string
  moneyBadEquity: string; moneyBad: string; unitAria: string; back: string
  lastStep: string; lastStepBody: string; namePh: string; phonePh: string; nameAria: string; phoneAria: string; nameBad: string; phoneBad: string
  showAssessment: string; fine: string; privacy: string
  thinking: string
  resultTitle: string; readiness: string; verdict: Record<'good' | 'moderate' | 'early', string>
  matchesTitle: string; strong: string; possible: string; within: string
  unlock: string; unlockFine: string
  footer: string; footerLink: string
  consent: string; consentLink: string; decline: string; accept: string; cookiesAria: string
  langName: string
}

export const FUNNEL: Record<Lang, FunnelText> = {
  en: {
    title: 'Is your project ready for financing? · Cobuildy',
    h1: 'Find out if your project is ready for financing',
    sub: n => `Answer 7 questions and get an initial assessment of your project’s funding readiness. ${n ? `${n} investors are waiting.` : 'Investors are waiting.'}`,
    trust: ['Matched against real investor mandates', '7 questions, about 2 minutes', 'Free initial assessment of your project'],
    q: {
      strategy: 'What type of project are you developing?', geo: 'Where is your project located?', stage: 'What is the current project stage?',
      gdv: 'What is the estimated Gross Development Value (GDV)?', ask: 'How much capital do you need?',
      equity: 'How much of your own capital goes in, including the land?', permit: 'Do you have the necessary permits?',
    },
    moneyHint: 'For example 4.5 or 750',
    checks: ['Evaluating project stage', 'Checking financing readiness', 'Assessing capital structure', 'Identifying potential funding options'],
    strategy: { land: 'Land development', wip: 'Work in progress', refurb: 'Refurbishment / Renovation' },
    stages: {
      land: { identified: 'Land identified', reserved: 'Land reserved', purchased: 'Land purchased', licensed: 'Building licence granted' },
      wip: { started: 'Construction started', partial: 'Construction partially completed', near: 'Near completion' },
      refurb: { identified: 'Property identified', acquired: 'Property acquired', started: 'Renovation started', done: 'Renovation completed' },
    },
    permits: { granted: 'Yes, all permits granted', submitted: 'Application submitted', process: 'In process', none: 'Not yet applied', notreq: 'Not required' },
    region: { CS: 'Costa del Sol', BCN: 'Barcelona', MAD: 'Madrid', VLC: 'Valencia', LIS: 'Lisbon', OPO: 'Porto', ALG: 'Algarve' },
    island: { 'Balearic Islands': 'Balearic Islands', 'Canary Islands': 'Canary Islands' },
    countries: { XES: 'Spain', XPT: 'Portugal', XX: 'Other country' },
    noEquity: 'No own equity', noEquityBtn: 'I have no equity to contribute', thousand: 'thousand', million: 'million',
    cityAria: 'Type your city or town', cityPlaceholder: 'Or type the city or town', next: 'Next', cityBad: 'Enter the name of the city or town.', suggestions: 'Suggestions',
    country: p => `Which country is ${p} in?`, changePlace: '← Change the place', otherCountry: p => `${p}, other country`, placeIn: (p, c) => `${p}, ${c}`, countryAria: 'Country',
    moneyBadEquity: 'Enter an amount, or 0 if you have none. ', moneyBad: 'Enter an amount in euros. ', unitAria: 'Unit', back: '← Back',
    lastStep: 'Last step', lastStepBody: 'Where should we save your results? Leave your name and phone, so your answers are not lost while you create your account. Our team can also call you if anything goes wrong.',
    namePh: 'Your name', phonePh: 'Phone, e.g. +34 600 123 456', nameAria: 'Your name', phoneAria: 'Your phone',
    nameBad: 'Enter your name.', phoneBad: 'Enter a phone number with the country code, for example +34 600 123 456.',
    showAssessment: 'Show my assessment', fine: 'We use your details only to help you with this project.', privacy: 'Privacy policy',
    thinking: 'Analysing your project…',
    resultTitle: 'Your Project Funding Assessment', readiness: 'Project Readiness',
    verdict: {
      good: 'Your project demonstrates good financing readiness.',
      moderate: 'Your project shows moderate financing readiness. A few gaps are worth closing before you approach investors.',
      early: 'Your project is at an early stage. Closing the main gaps will raise its chances with investors.',
    },
    matchesTitle: 'Potential Investor Matches', strong: 'strong fit: your project meets their criteria today', possible: 'possible fit: close, a few details to confirm', within: 'within reach: a bigger or smaller raise, or a gap closed, would fit',
    unlock: 'Unlock Your Investor Matches', unlockFine: 'Free. Your answers are saved to your new account.',
    footer: 'Cobuildy S.L. is an introducer between developers and investors. It is not a financial adviser and does not give investment advice.', footerLink: 'Privacy and cookies',
    consent: 'We use a marketing cookie (Meta Pixel) to measure which ads bring useful visitors. It is off unless you accept.', consentLink: 'Privacy policy', decline: 'Decline', accept: 'Accept', cookiesAria: 'Cookies',
    langName: 'English',
  },
  es: {
    title: '¿Está tu proyecto listo para financiarse? · Cobuildy',
    h1: 'Descubre si tu proyecto está listo para financiarse',
    sub: n => `Responde 7 preguntas y recibe una evaluación inicial de la preparación de tu proyecto para obtener financiación. ${n ? `${n} inversores están esperando.` : 'Hay inversores esperando.'}`,
    trust: ['Contrastado con mandatos reales de inversores', '7 preguntas, unos 2 minutos', 'Evaluación inicial gratuita de tu proyecto'],
    q: {
      strategy: '¿Qué tipo de proyecto estás desarrollando?', geo: '¿Dónde se ubica tu proyecto?', stage: '¿En qué fase está el proyecto?',
      gdv: '¿Cuál es el valor bruto de desarrollo (GDV) estimado, es decir, el valor total de venta?', ask: '¿Cuánto capital necesitas?',
      equity: '¿Cuánto capital propio aportas, incluido el suelo?', permit: '¿Cuentas con los permisos necesarios?',
    },
    moneyHint: 'Por ejemplo 4,5 o 750',
    checks: ['Evaluando la fase del proyecto', 'Comprobando la preparación para la financiación', 'Analizando la estructura de capital', 'Identificando posibles opciones de financiación'],
    strategy: { land: 'Promoción sobre suelo', wip: 'Obra en curso', refurb: 'Rehabilitación / Reforma' },
    stages: {
      land: { identified: 'Suelo identificado', reserved: 'Suelo reservado', purchased: 'Suelo comprado', licensed: 'Licencia de obra concedida' },
      wip: { started: 'Obra iniciada', partial: 'Obra parcialmente ejecutada', near: 'Obra casi terminada' },
      refurb: { identified: 'Inmueble identificado', acquired: 'Inmueble adquirido', started: 'Reforma iniciada', done: 'Reforma terminada' },
    },
    permits: { granted: 'Sí, todos los permisos concedidos', submitted: 'Solicitud presentada', process: 'En trámite', none: 'Aún no solicitados', notreq: 'No son necesarios' },
    region: { CS: 'Costa del Sol', BCN: 'Barcelona', MAD: 'Madrid', VLC: 'Valencia', LIS: 'Lisboa', OPO: 'Oporto', ALG: 'Algarve' },
    island: { 'Balearic Islands': 'Islas Baleares', 'Canary Islands': 'Islas Canarias' },
    countries: { XES: 'España', XPT: 'Portugal', XX: 'Otro país' },
    noEquity: 'Sin capital propio', noEquityBtn: 'No tengo capital propio que aportar', thousand: 'mil', million: 'millones',
    cityAria: 'Escribe tu ciudad o municipio', cityPlaceholder: 'O escribe la ciudad o el municipio', next: 'Siguiente', cityBad: 'Introduce el nombre de la ciudad o del municipio.', suggestions: 'Sugerencias',
    country: p => `¿En qué país está ${p}?`, changePlace: '← Cambiar el lugar', otherCountry: p => `${p}, otro país`, placeIn: (p, c) => `${p}, ${c}`, countryAria: 'País',
    moneyBadEquity: 'Introduce un importe, o 0 si no aportas. ', moneyBad: 'Introduce un importe en euros. ', unitAria: 'Unidad', back: '← Atrás',
    lastStep: 'Último paso', lastStepBody: '¿Dónde guardamos tus resultados? Deja tu nombre y tu teléfono para no perder tus respuestas mientras creas tu cuenta. Nuestro equipo también puede llamarte si algo falla.',
    namePh: 'Tu nombre', phonePh: 'Teléfono, p. ej. +34 600 123 456', nameAria: 'Tu nombre', phoneAria: 'Tu teléfono',
    nameBad: 'Introduce tu nombre.', phoneBad: 'Introduce un teléfono con el prefijo del país, por ejemplo +34 600 123 456.',
    showAssessment: 'Ver mi evaluación', fine: 'Usamos tus datos solo para ayudarte con este proyecto.', privacy: 'Política de privacidad',
    thinking: 'Analizando tu proyecto…',
    resultTitle: 'Evaluación de financiación de tu proyecto', readiness: 'Preparación del proyecto',
    verdict: {
      good: 'Tu proyecto muestra una buena preparación para obtener financiación.',
      moderate: 'Tu proyecto muestra una preparación media para obtener financiación. Conviene cerrar algunas carencias antes de acercarte a los inversores.',
      early: 'Tu proyecto está en una fase inicial. Cerrar las carencias principales aumentará sus opciones ante los inversores.',
    },
    matchesTitle: 'Posibles inversores', strong: 'encaje alto: tu proyecto cumple hoy sus criterios', possible: 'encaje posible: cerca, faltan algunos detalles por confirmar', within: 'al alcance: otra cuantía, o cerrar una carencia, encajaría',
    unlock: 'Desbloquear mis inversores', unlockFine: 'Gratis. Tus respuestas se guardan en tu nueva cuenta.',
    footer: 'Cobuildy S.L. es un intermediario entre promotores e inversores. No es asesor financiero ni presta asesoramiento de inversión.', footerLink: 'Privacidad y cookies',
    consent: 'Usamos una cookie de marketing (Meta Pixel) para medir qué anuncios traen visitantes útiles. Está desactivada salvo que la aceptes.', consentLink: 'Política de privacidad', decline: 'Rechazar', accept: 'Aceptar', cookiesAria: 'Cookies',
    langName: 'Español',
  },
}
