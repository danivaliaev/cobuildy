// Copies the landing page into the web app so signed-out visitors see it at the app's address.
// The landing keeps working on its own (landing/); only the login links are made local here.
import { readFileSync, writeFileSync } from 'node:fs'
const html = readFileSync('landing/index.html', 'utf8').replaceAll("https://cobuildy.dv-ac6.workers.dev/login", "/login").replaceAll("https://cobuildy.dv-ac6.workers.dev/start", "/start")
writeFileSync('web/public/landing.html', html)
console.log('landing.html:', html.length, 'bytes')
