/**
 * Compare our Melbourne page to the 3 competitors beating us
 */
const COMPETITORS = [
  'https://www.genderrevealer.com.au',
  'https://genderrevealcannon.com.au',
  'https://www.kaboomconfetti.com.au',
  'https://genderrevealideas.com.au/collections/gender-reveal-ideas-melbourne',
]

for (const url of COMPETITORS) {
  try {
    const r = await fetch(url, { headers:{ 'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' } })
    const html = await r.text()
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || ''
    const desc = html.match(/<meta name="description" content="([^"]+)"/i)?.[1] || ''
    const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => m[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim())
    const h2s = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map(m => m[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()).slice(0,10)
    const melbourneCount = (html.toLowerCase().match(/melbourne/g) || []).length
    const schemaBlocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    const schemaTypes = schemaBlocks.map(m => {
      try { const j = JSON.parse(m[1]); return Array.isArray(j['@graph'])?j['@graph'].map(g=>g['@type']).join(','):j['@type']||'?' } catch { return 'parse-err' }
    })
    const wordCount = html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().split(' ').length

    console.log(`\n========== ${url} ==========`)
    console.log(`TITLE: ${title}`)
    console.log(`DESC:  ${desc?.slice(0,150)}`)
    console.log(`H1 (${h1s.length}): ${h1s.slice(0,3).join(' | ')}`)
    console.log(`H2 sample (${h2s.length} total): ${h2s.slice(0,5).join(' | ')}`)
    console.log(`Word count (incl HTML noise): ${wordCount}`)
    console.log(`"Melbourne" mentions: ${melbourneCount}`)
    console.log(`Schema types: ${schemaTypes.join(' | ')}`)
  } catch (e) {
    console.log(`\n${url}: FETCH ERR ${e.message}`)
  }
}
