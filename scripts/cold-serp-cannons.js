/**
 * Cold user POV: "gender reveal cannons" on Google AU
 * Use SERP advanced endpoint to capture paid + shopping + organic in order
 */
import 'dotenv/config'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

async function scrape(device) {
  const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
    method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
    body: JSON.stringify([{keyword:'gender reveal cannons', location_code:2036, language_code:'en', device, depth:30, calculate_rectangles:false}])
  }).then(r=>r.json())
  return r.tasks?.[0]?.result?.[0]?.items||[]
}

for (const device of ['desktop','mobile']) {
  console.log(`\n\n========== ${device.toUpperCase()} — what a cold user sees scrolling top to bottom ==========\n`)
  const items = await scrape(device)
  if (!items.length) { console.log('No items returned'); continue }
  let pos = 0
  for (const it of items.slice(0,40)) {
    pos++
    const type = it.type
    const domain = it.domain || ''
    const url = (it.url||'').slice(0,70)
    const title = (it.title||'').slice(0,70)
    const isOurs = /genderrevealideas\.com\.au/i.test(domain || it.url || '')
    const star = isOurs ? '⭐ GRI' : '      '
    if (type === 'paid') {
      console.log(`${star} #${pos} 💰 PAID AD       | ${domain.padEnd(30)} | ${title}`)
    } else if (type === 'shopping') {
      // shopping carousel - it.items contains products
      console.log(`${star} #${pos} 🛒 SHOPPING ROW  | ${(it.items||[]).length} products`)
      ;(it.items||[]).slice(0,8).forEach((p,idx)=>{
        const ours = /genderrevealideas/i.test(p.url||p.shop||'')
        console.log(`        ${ours?'⭐':'  '} ${idx+1}. ${(p.title||'').slice(0,55).padEnd(55)} | ${(p.price?.current||'')} | ${(p.shop||'').slice(0,30)}`)
      })
    } else if (type === 'organic') {
      console.log(`${star} #${pos} 🔵 ORGANIC      | ${domain.padEnd(30)} | ${title}`)
    } else if (type === 'people_also_ask') {
      console.log(`       #${pos} ❓ PAA          | ${(it.items||[]).length} questions`)
    } else if (type === 'video') {
      console.log(`       #${pos} 🎬 VIDEO        | ${domain.padEnd(30)} | ${title}`)
    } else if (type === 'images') {
      console.log(`       #${pos} 🖼️  IMAGES`)
    } else if (type === 'local_pack' || type === 'map') {
      console.log(`       #${pos} 📍 LOCAL PACK   | ${(it.items||[]).length} businesses`)
    } else if (type === 'ai_overview') {
      console.log(`       #${pos} 🤖 AI OVERVIEW  | references: ${(it.references||[]).length}`)
    } else {
      console.log(`       #${pos} [${type}]`)
    }
  }
}
process.exit(0)
