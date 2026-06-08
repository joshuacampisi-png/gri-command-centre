import { readFileSync } from 'fs'
const a = JSON.parse(readFileSync('data/snapshots/adelaide-template.json','utf8'))
const html = a.descriptionHtml
console.log('Length:', html.length)
// Count Adelaide mentions
console.log('Adelaide mentions:', (html.match(/Adelaide/gi)||[]).length)
console.log('South Australia mentions:', (html.match(/South Australia/gi)||[]).length)
console.log('SA mentions:', (html.match(/\bSA\b/g)||[]).length)
// Find suburbs from data file referenced
console.log('\n--- Find venue lists ---')
// Try to find sections with text "Adelaide Botanic Gardens" or "Glenelg Beach"
const venues = ['Adelaide Botanic Gardens','Glenelg Beach','Henley Beach','Brighton Beach','Mount Lofty','Belair National Park','Adelaide Oval','Victoria Square','Adelaide Hills','Semaphore Beach']
for (const v of venues) {
  const ix = html.indexOf(v)
  if (ix>=0) console.log(`  "${v}" found at index ${ix}`)
}
const suburbs = ['Norwood','Glenelg','Henley Beach','Brighton','Unley','North Adelaide','Magill','Hyde Park','Burnside','Prospect']
console.log('\n--- Find suburb lists ---')
for (const s of suburbs) {
  const ix = html.indexOf(s)
  if (ix>=0) console.log(`  "${s}" found at index ${ix}`)
}
