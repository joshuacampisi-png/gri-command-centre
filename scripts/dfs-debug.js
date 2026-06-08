import 'dotenv/config'
const EMAIL = process.env.DATAFORSEO_EMAIL
const PASSWORD = process.env.DATAFORSEO_PASSWORD
const AUTH = 'Basic ' + Buffer.from(`${EMAIL}:${PASSWORD}`).toString('base64')

// Debug: try a SERP call with detailed error reporting
const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/regular', {
  method: 'POST',
  headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
  body: JSON.stringify([
    { keyword: 'gender reveal cannons', location_code: 2036, language_code: 'en', device: 'desktop', depth: 10 },
    { keyword: 'gender reveal tasmania', location_code: 2036, language_code: 'en', device: 'desktop', depth: 10 },
  ]),
})
const d = await r.json()
console.log(JSON.stringify(d, null, 2).slice(0, 3000))
