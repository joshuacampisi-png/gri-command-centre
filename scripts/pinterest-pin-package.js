/**
 * Pre-build the complete Pinterest pin upload package:
 *  - Downloads all hero images organized by board category
 *  - Generates SEO title + description + product URL per pin
 *  - Outputs CSV for easy paste during manual upload
 */
import 'dotenv/config'
import { mkdirSync, writeFileSync, createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { readFileSync } from 'fs'

const products = JSON.parse(readFileSync('data/snapshots/pinterest/products-with-images.json', 'utf8'))

const BOARDS = {
  'Gender Reveal Cannons':            { dir: '01-cannons',     match: p => /cannon/i.test(p.title) && !/extinguisher|blaster|bundle/i.test(p.title) },
  'Gender Reveal Smoke Bombs':        { dir: '02-smoke-bombs', match: p => /smoke/i.test(p.title) || (p.tags||[]).includes('smoke') },
  'Gender Reveal Powder Blasters':    { dir: '03-blasters',    match: p => /blaster|extinguisher/i.test(p.title) },
  'Gender Reveal Sports Reveals':     { dir: '04-sports',      match: p => /football|rugby|soccer|golf|cricket|afl|basketball|tennis|baseball/i.test(p.title) || (p.tags||[]).map(t=>t.toLowerCase()).includes('sports') },
  'Gender Reveal Bundles':            { dir: '05-bundles',     match: p => /bundle|pack|kit/i.test(p.title) },
  'Gender Reveal Balloon Reveals':    { dir: '06-balloons',    match: p => /balloon/i.test(p.title) },
  'Gender Reveal TNT Box':            { dir: '07-tnt',         match: p => /tnt/i.test(p.title) },
  'Gender Reveal Burnout Powder':     { dir: '08-burnout',     match: p => /burnout/i.test(p.title) },
  'Gender Reveal Dry Ice Reveals':    { dir: '09-dry-ice',     match: p => /dry ice/i.test(p.title) },
}

mkdirSync('data/snapshots/pinterest/pins', { recursive: true })
for (const b of Object.values(BOARDS)) mkdirSync(`data/snapshots/pinterest/pins/${b.dir}`, { recursive: true })

// Generate SEO description templates
function buildDescription(product, category) {
  const handle = product.handle
  const price = product.price > 0 ? `$${product.price.toFixed(2)} AUD` : ''
  const templates = {
    'Gender Reveal Cannons': `${product.title} 🎉 Australia's #1 gender reveal cannons — ${price ? price + '. ' : ''}Pink, blue or secret colour. Custom-made on the Gold Coast. Free express shipping AU-wide. 4.85★ from 70,000+ reviews. #genderreveal #genderrevealideas #genderrevealparty #babyshower #pinkorblue #boyorgirl #genderrevealaustralia #revealcannon`,
    'Gender Reveal Smoke Bombs': `${product.title} 💨 Vibrant pink or blue gender reveal smoke bombs — ${price ? price + '. ' : ''}Long-lasting clouds, photo-perfect, eco-friendly and biodegradable. Free express shipping across Australia. #smokebombs #genderreveal #pinkorblue #babyshower #genderrevealparty #genderrevealideas #boyorgirl #revealsmoke`,
    'Gender Reveal Powder Blasters': `${product.title} 🌫️ Massive powder blaster gender reveal — ${price ? price + '. ' : ''}Up to 10m distance, 15-second blast. Non-toxic, eco-friendly powder. Australia's biggest range. #powderblaster #genderreveal #genderrevealideas #babyshower #pinkorblue #boyorgirl #revealparty`,
    'Gender Reveal Sports Reveals': `${product.title} ⚽ Unique sports-themed gender reveal — ${price ? price + '. ' : ''}Hit, kick or strike to release pink or blue powder. Perfect photo moment. Custom Australian-made. #sportsreveal #genderreveal #genderrevealideas #footyreveal #babyshower #pinkorblue #boyorgirl`,
    'Gender Reveal Bundles': `${product.title} 🎁 Complete gender reveal party bundle — ${price ? price + '. ' : ''}Everything you need in one box. Free express shipping nationwide. Save vs buying separately. #genderrevealbundle #genderrevealparty #genderrevealideas #babyshower #pinkorblue #boyorgirl`,
    'Gender Reveal Balloon Reveals': `${product.title} 🎈 Pop the balloon to reveal pink or blue confetti — ${price ? price + '. ' : ''}Easy setup, photo-ready reveal. Australia-wide delivery. #genderrevealballoon #genderreveal #babyshower #pinkorblue #boyorgirl #revealparty #genderrevealideas`,
    'Gender Reveal TNT Box': `${product.title} 💥 The TNT gender reveal — ${price ? price + '. ' : ''}Australia's most explosive reveal moment. Dramatic colour blast. #tntgenderreveal #genderreveal #genderrevealideas #babyshower #pinkorblue #boyorgirl #explosivereveal`,
    'Gender Reveal Burnout Powder': `${product.title} 🚗💨 Tyre burnout gender reveal — ${price ? price + '. ' : ''}Mega 2KG bags for dramatic smoke and powder. Eco-friendly biodegradable powder. #burnoutreveal #genderreveal #carreveal #babyshower #pinkorblue #boyorgirl #genderrevealideas`,
    'Gender Reveal Dry Ice Reveals': `${product.title} 🥶 Dry ice gender reveal — ${price ? price + '. ' : ''}Bubbling pink or blue clouds. Stunning photo moment. Australian-made setup. #dryicereveal #genderreveal #genderrevealideas #babyshower #pinkorblue #boyorgirl #magicalreveal`,
  }
  return templates[category] || `${product.title} — Australia's #1 gender reveal store. Free express shipping. 4.85★ from 70,000+ reviews. Shop at genderrevealideas.com.au #genderreveal #genderrevealideas`
}

function buildTitle(product, category) {
  // Pin title limit 100 chars; first 40 chars matter most for Pinterest
  const base = product.title.replace(/\s+\d+(KG|kg|cm|CM|ml|ML)?\s*/g, ' ').trim()
  const short = base.length > 75 ? base.slice(0, 72) + '...' : base
  return `${short} | Gender Reveal Ideas AU`
}

// Build CSV
let csvRows = ['Board,Image File,Title,Description,Destination URL,Source Image URL']
let pinsByBoard = {}

for (const p of products) {
  for (const [boardName, b] of Object.entries(BOARDS)) {
    if (b.match(p)) {
      pinsByBoard[boardName] = pinsByBoard[boardName] || []
      pinsByBoard[boardName].push(p)
      const title = buildTitle(p, boardName).replace(/"/g, "'")
      const desc = buildDescription(p, boardName).replace(/"/g, "'")
      const filename = `${p.handle}.jpg`
      csvRows.push(`"${boardName}","${b.dir}/${filename}","${title}","${desc}","${p.productUrl}","${p.heroImage}"`)
      break  // only first matching board per product
    }
  }
}

writeFileSync('data/snapshots/pinterest/pins/PIN-UPLOAD-PLAYBOOK.csv', csvRows.join('\n'))
console.log(`\n=== PIN PACKAGE READY ===`)
console.log(`CSV rows: ${csvRows.length - 1}`)
console.log(`\nPins per board:`)
for (const [name, pins] of Object.entries(pinsByBoard).sort((a,b)=>b[1].length-a[1].length)) {
  console.log(`  ${name.padEnd(45)} ${pins.length} pins`)
}

// Download hero images
console.log(`\nDownloading hero images...`)
let downloaded = 0
for (const p of products) {
  for (const [boardName, b] of Object.entries(BOARDS)) {
    if (b.match(p) && p.heroImage) {
      const filename = `${p.handle}.jpg`
      const path = `data/snapshots/pinterest/pins/${b.dir}/${filename}`
      try {
        const r = await fetch(p.heroImage)
        if (r.ok) {
          const buf = Buffer.from(await r.arrayBuffer())
          writeFileSync(path, buf)
          downloaded++
        }
      } catch (e) { console.log(`  ✗ ${p.title.slice(0,40)}: ${e.message}`) }
      break
    }
  }
}
console.log(`\n✓ Downloaded ${downloaded} hero images`)
console.log(`\nAll files in: data/snapshots/pinterest/pins/`)
console.log(`CSV master: data/snapshots/pinterest/pins/PIN-UPLOAD-PLAYBOOK.csv`)
process.exit(0)
