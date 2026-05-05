/**
 * upload-hero-banner.js
 * Uploads Desktop.webp and Mobile.webp to Shopify Files via GraphQL stagedUploadsCreate,
 * then finds the active theme's hero banner section and swaps the image references.
 *
 * Usage:
 *   node scripts/upload-hero-banner.js --inspect    # just find hero section, no changes
 *   node scripts/upload-hero-banner.js --upload     # upload files only, print URLs
 *   node scripts/upload-hero-banner.js --swap       # full: upload + swap in theme
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// Load .env
const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
for (const line of envText.split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}

const STORE = process.env.SHOPIFY_STORE_DOMAIN
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
const REST = `https://${STORE}/admin/api/2026-01`
const GQL = `https://${STORE}/admin/api/2026-01/graphql.json`

const args = process.argv.slice(2)
const MODE = args.find(a => ['--inspect','--upload','--swap'].includes(a)) || '--inspect'

const DESKTOP_PATH = '/Users/wogbot/Desktop/banner/Desktop.webp'
const MOBILE_PATH = '/Users/wogbot/Desktop/banner/Mobile.webp'

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.data
}

async function rest(urlPath, opts = {}) {
  const res = await fetch(`${REST}${urlPath}`, {
    ...opts,
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) }
  })
  if (!res.ok) throw new Error(`REST ${opts.method || 'GET'} ${urlPath}: ${res.status} — ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

// ── Stage + upload a file to Shopify Files ──
async function uploadFile(filePath, filename) {
  const buf = fs.readFileSync(filePath)
  const size = buf.length
  console.log(`  Uploading ${filename} (${(size / 1024).toFixed(1)} KB)...`)

  // 1. Create staged upload target
  const staged = await gql(`
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`, {
    input: [{
      filename,
      mimeType: 'image/webp',
      httpMethod: 'POST',
      resource: 'FILE',
      fileSize: String(size)
    }]
  })
  const errs = staged.stagedUploadsCreate.userErrors
  if (errs && errs.length) throw new Error('stagedUploadsCreate: ' + JSON.stringify(errs))
  const target = staged.stagedUploadsCreate.stagedTargets[0]

  // 2. POST file to the staged target
  const form = new FormData()
  for (const p of target.parameters) form.append(p.name, p.value)
  form.append('file', new Blob([buf], { type: 'image/webp' }), filename)
  const upRes = await fetch(target.url, { method: 'POST', body: form })
  if (!upRes.ok && upRes.status !== 201 && upRes.status !== 204) {
    const txt = await upRes.text()
    throw new Error(`Staged upload failed: ${upRes.status} — ${txt.slice(0, 300)}`)
  }

  // 3. Create file record in Shopify
  const created = await gql(`
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { id alt fileStatus ... on MediaImage { id image { url width height } } }
        userErrors { field message }
      }
    }`, {
    files: [{
      alt: filename.replace(/\.[^.]+$/, ''),
      contentType: 'IMAGE',
      originalSource: target.resourceUrl
    }]
  })
  const cErrs = created.fileCreate.userErrors
  if (cErrs && cErrs.length) throw new Error('fileCreate: ' + JSON.stringify(cErrs))
  const file = created.fileCreate.files[0]
  console.log(`    file id: ${file.id}`)
  return file
}

// Poll file status until READY, then fetch its public URL
async function waitForFile(fileGid, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const data = await gql(`
      query($id: ID!) {
        node(id: $id) {
          ... on MediaImage {
            id
            fileStatus
            image { url width height }
          }
        }
      }`, { id: fileGid })
    const node = data.node
    if (node?.fileStatus === 'READY' && node.image?.url) {
      return node.image
    }
    if (node?.fileStatus === 'FAILED') throw new Error(`File processing FAILED: ${fileGid}`)
    await new Promise(r => setTimeout(r, 1500))
  }
  throw new Error(`File did not become READY in time: ${fileGid}`)
}

// ── Theme helpers ──
async function getActiveTheme() {
  const data = await rest('/themes.json')
  return data.themes.find(t => t.role === 'main')
}

async function listThemeAssets(themeId) {
  const data = await rest(`/themes/${themeId}/assets.json`)
  return data.assets || []
}

async function getAsset(themeId, key) {
  const url = `/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`
  const data = await rest(url)
  return data.asset
}

async function putAsset(themeId, key, value) {
  return rest(`/themes/${themeId}/assets.json`, {
    method: 'PUT',
    body: JSON.stringify({ asset: { key, value } })
  })
}

// ── Main ──
async function main() {
  console.log(`Store: ${STORE}`)
  console.log(`Mode: ${MODE}\n`)

  // Always start by finding the hero banner section
  const theme = await getActiveTheme()
  console.log(`Active theme: ${theme.name} (id: ${theme.id})`)

  const assets = await listThemeAssets(theme.id)
  const sectionFiles = assets.filter(a => /^(sections|templates)\//.test(a.key))
  console.log(`  ${sectionFiles.length} section/template files`)

  // Get templates/index.json or templates/index.*.json which defines homepage sections
  const indexCandidates = sectionFiles.filter(a => /^templates\/index\./.test(a.key))
  console.log(`  Index templates: ${indexCandidates.map(a => a.key).join(', ')}`)

  let indexJson = null
  let indexKey = null
  for (const cand of indexCandidates) {
    if (cand.key.endsWith('.json')) {
      indexKey = cand.key
      const asset = await getAsset(theme.id, cand.key)
      try { indexJson = JSON.parse(asset.value) } catch {}
      break
    }
  }
  if (!indexJson) {
    // Try default
    const asset = await getAsset(theme.id, 'templates/index.json').catch(() => null)
    if (asset) { indexKey = 'templates/index.json'; indexJson = JSON.parse(asset.value) }
  }
  if (!indexJson) throw new Error('Could not find templates/index.json')
  console.log(`\nIndex template: ${indexKey}`)
  console.log(`  Sections in order: ${(indexJson.order || []).join(', ')}`)

  // Find the hero / image-banner section — usually the first one or named "image_banner"/"slideshow"/"hero"
  const sections = indexJson.sections || {}
  const candidates = []
  for (const [id, sec] of Object.entries(sections)) {
    const type = sec.type || ''
    if (/image.?banner|slideshow|hero|banner/i.test(type)) {
      candidates.push({ id, type, settings: sec.settings, blocks: sec.blocks })
    }
  }
  console.log(`\nHero/banner candidates (${candidates.length}):`)
  for (const c of candidates) {
    console.log(`  [${c.id}] type=${c.type}`)
    console.log(`    settings keys: ${Object.keys(c.settings || {}).join(', ')}`)
    // Print any image-looking setting
    for (const [k, v] of Object.entries(c.settings || {})) {
      if (typeof v === 'string' && (/shopify:\/\/|\.(jpe?g|png|webp|gif)/i.test(v) || k.toLowerCase().includes('image'))) {
        console.log(`      ${k} = ${v}`)
      }
    }
    if (c.blocks) {
      for (const [bid, block] of Object.entries(c.blocks)) {
        for (const [k, v] of Object.entries(block.settings || {})) {
          if (typeof v === 'string' && (/shopify:\/\/|\.(jpe?g|png|webp|gif)/i.test(v) || k.toLowerCase().includes('image'))) {
            console.log(`      [block ${bid} type=${block.type}] ${k} = ${v}`)
          }
        }
      }
    }
  }

  if (MODE === '--inspect') {
    console.log('\n[INSPECT] — done. Re-run with --swap to upload + patch theme.')
    return
  }

  // Upload files
  console.log('\nUploading files...')
  const desktopFile = await uploadFile(DESKTOP_PATH, 'hero-celebrate-new-life-desktop.webp')
  const mobileFile = await uploadFile(MOBILE_PATH, 'hero-celebrate-new-life-mobile.webp')

  console.log('\nWaiting for files to process...')
  const desktopImg = await waitForFile(desktopFile.id)
  const mobileImg = await waitForFile(mobileFile.id)
  console.log(`  Desktop URL: ${desktopImg.url}`)
  console.log(`   Mobile URL: ${mobileImg.url}`)
  console.log(`  Desktop size: ${desktopImg.width}x${desktopImg.height}`)
  console.log(`   Mobile size: ${mobileImg.width}x${mobileImg.height}`)

  if (MODE === '--upload') {
    console.log('\n[UPLOAD] — done. URLs printed above. Re-run with --swap to patch theme.')
    return
  }

  // --swap: patch the index.json hero section
  // This is best-effort — we print what we'd change, and require the user to confirm structure
  // For now, we save the URLs and index snapshot to a file for review
  const report = {
    theme: { id: theme.id, name: theme.name },
    indexKey,
    desktop: { url: desktopImg.url, fileId: desktopFile.id, width: desktopImg.width, height: desktopImg.height },
    mobile: { url: mobileImg.url, fileId: mobileFile.id, width: mobileImg.width, height: mobileImg.height },
    heroCandidates: candidates
  }
  fs.writeFileSync('/tmp/hero-banner-report.json', JSON.stringify(report, null, 2))
  console.log('\nReport written to /tmp/hero-banner-report.json')
  console.log('Review hero candidates above, then manually patch or tell the script which section/setting to swap.')
}

main().catch(e => { console.error('FATAL:', e.message || e); process.exit(1) })
