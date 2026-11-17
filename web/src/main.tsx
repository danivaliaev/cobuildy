import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth'
import { App } from './App'
import './styles.css'
import { rememberUrlLang, useLang } from './i18n'

rememberUrlLang()

/** Remounts the app when the language changes, so every label, including those read from plain tables, is drawn again. */
function Localised() { const lang = useLang(); return <React.Fragment key={lang}><App /></React.Fragment> }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Localised />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
