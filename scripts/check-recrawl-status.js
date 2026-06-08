/**
 * Check re-crawl lag on amplified pages
 * 1. Quick rank re-check on amplified pages
 * 2. Use site: query to check if Google has the new content indexed
 */
import 'dotenv/config'
const AUTH = 'Basic ' + Buffer.from(`${process.env.DATAFORSEO_EMAIL}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')

const PAGES = [
  // Yesterday's (May 17) batch 1
  { handle:'gender-reveal-ideas-canberra', query:'gender reveal canberra', shippedAt:'2026-05-18 08:00 UTC (~12hrs ago)', wasRank:15 },
  { handle:'gender-reveal-ideas-act', query:'gender reveal act', shippedAt:'~12hrs ago', wasRank:null },
  { handle:'gender-reveal-ideas-townsville', query:'gender reveal townsville', shippedAt:'~12hrs ago (created)', wasRank:12 },
  { handle:'gender-reveal-ideas-melbourne', query:'gender reveal melbourne', shippedAt:'~18hrs ago (density fix)', wasRank:9 },
  // Just-shipped batch 2 (15 min ago)
  { handle:'gender-reveal-ideas-newcastle', query:'gender reveal newcastle', shippedAt:'15min ago', wasRank:7 },
  { handle:'gender-reveal-ideas-hobart', query:'gender reveal hobart', shippedAt:'15min ago', wasRank:5 },
  { handle:'gender-reveal-ideas-sunshine-coast', query:'gender reveal sunshine coast', shippedAt:'15min ago', wasRank:4 },
  { handle:'gender-reveal-ideas-cairns', query:'gender reveal cairns', shippedAt:'15min ago', wasRank:6 },
  { handle:'gender-reveal-ideas-geelong', query:'gender reveal geelong', shippedAt:'15min ago', wasRank:null },
  { handle:'gender-reveals-victoria', query:'gender reveal vic', shippedAt:'15min ago', wasRank:4 },
]

console.log(`\n=== RE-CRAWL LAG CHECK — ${new Date().toISOString().slice(0,16)} ===\n`)
console.log('Page                                  | Was  | Now  | Shipped     | Lag status')
console.log('---------------------------------------+------+------+-------------+-----------')

for (const p of PAGES) {
  try {
    // Get current rank
    const r = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
      method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
      body: JSON.stringify([{keyword:p.query, location_code:2036, language_code:'en', device:'desktop', depth:30}])
    }).then(r=>r.json())
    const items = r.tasks?.[0]?.result?.[0]?.items||[]
    let orgIdx=0, currentRank=null
    for (const it of items) {
      if (it.type==='organic') {
        orgIdx++
        if (/genderrevealideas\.com\.au/i.test(it.domain||it.url||'') && !currentRank) currentRank=orgIdx
      }
    }
    // site: check — see if Google has indexed the new content
    const siteR = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
      method:'POST', headers:{Authorization:AUTH,'Content-Type':'application/json'},
      body: JSON.stringify([{keyword:`site:genderrevealideas.com.au/collections/${p.handle}`, location_code:2036, language_code:'en', device:'desktop', depth:5}])
    }).then(r=>r.json())
    const siteItems = siteR.tasks?.[0]?.result?.[0]?.items||[]
    const ourPageItem = siteItems.find(it => it.type==='organic' && (it.url||'').includes(p.handle))
    // Check the snippet/title shown
    const snippetText = (ourPageItem?.description || ourPageItem?.snippet || '').slice(0,200)
    // If our new amplified content mentions things like "70,000+ Happy Families" or the new template hero, Google has indexed
    const hasNewContent = /70,000\+|Same Day Dispatch|Australia's biggest range|Most Popular Gender Reveals/i.test(snippetText)
    const indexedStatus = ourPageItem ? (hasNewContent ? '✅ NEW indexed' : '⏳ OLD cached') : '❌ not indexed'

    const change = (currentRank && p.wasRank) ? (p.wasRank - currentRank) : null
    const changeStr = change === null ? '—' : change>0 ? `↑${change}` : change<0 ? `↓${-change}` : '='
    const rankStr = `${p.wasRank?`#${p.wasRank}`:'--'} | ${currentRank?`#${currentRank}`:'--'}`
    console.log(`${p.handle.padEnd(38)} | ${(p.wasRank?`#${p.wasRank}`:'---').padStart(4)} | ${(currentRank?`#${currentRank}`:'---').padStart(4)} | ${p.shippedAt.padEnd(11)} | ${indexedStatus} ${changeStr}`)
  } catch (e) {
    console.log(`${p.handle}: ERR ${e.message?.slice(0,30)}`)
  }
  await new Promise(r=>setTimeout(r,400))
}
console.log(`\nNote: Google typical re-crawl lag = 24-72hrs for collection pages.`)
console.log(`Submit via GSC URL Inspection → Request Indexing to speed up.`)
process.exit(0)
