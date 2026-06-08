import 'dotenv/config'
const auth = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_USER}:${process.env.DATAFORSEO_PASS}`).toString('base64')
const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
  method:'POST', headers:{Authorization:auth,'Content-Type':'application/json'},
  body: JSON.stringify([{keyword:'gender reveal cannons', location_code:2036, language_code:'en', device:'desktop', se_domain:'google.com.au', depth:30}])
})
const j = await r.json()
console.log('status_code:', j.status_code, j.status_message)
console.log('cost:', j.cost)
console.log('tasks[0] status:', j.tasks?.[0]?.status_code, j.tasks?.[0]?.status_message)
console.log('result count:', j.tasks?.[0]?.result?.length)
if (j.tasks?.[0]?.result?.[0]) {
  const res = j.tasks[0].result[0]
  console.log('result keys:', Object.keys(res))
  console.log('items_count:', res.items_count)
  console.log('items length:', res.items?.length)
}
