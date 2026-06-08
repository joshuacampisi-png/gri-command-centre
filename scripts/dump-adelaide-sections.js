import { readFileSync } from 'fs'
const a = JSON.parse(readFileSync('data/snapshots/adelaide-template.json','utf8'))
const html = a.descriptionHtml
// Print every 1500 chars
for (let i=0; i<html.length; i+=2500) {
  console.log(`\n--- ${i}-${i+2500} ---`)
  console.log(html.slice(i, i+2500))
}
