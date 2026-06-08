/**
 * Debug DataForSEO shopping response shape + try Google Ads auction insights
 */
import 'dotenv/config'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

// Debug: dump full response for 1 query
const r = await fetch('https://api.dataforseo.com/v3/serp/google/shopping/live/advanced', {
  method:'POST',
  headers:{Authorization:AUTH,'Content-Type':'application/json'},
  body: JSON.stringify([{keyword:'gender reveal cannons', location_code:2036, language_code:'en', device:'desktop', depth:30}])
}).then(r=>r.json())
console.log('Top-level:', JSON.stringify({status_code:r.status_code, status_message:r.status_message, tasks_count:r.tasks?.length}, null, 2))
const task = r.tasks?.[0]
console.log('Task status:', task?.status_code, task?.status_message)
const result = task?.result?.[0]
console.log('Result keys:', result ? Object.keys(result) : 'no result')
console.log('Items count:', result?.items?.length)
console.log('First 3 items raw:')
console.log(JSON.stringify((result?.items||[]).slice(0,3), null, 2))
process.exit(0)
