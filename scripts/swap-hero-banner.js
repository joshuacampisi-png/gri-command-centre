/**
 * swap-hero-banner.js
 * Full automated pipeline:
 *  1. Upload Desktop.webp + Mobile.webp to Shopify Files (GraphQL stagedUploadsCreate)
 *  2. Wait for file processing to READY
 *  3. Patch slide_9djcXh image + mobile_image in templates/index.json AND templates/index.context.au.json
 *  4. PUT updated theme assets
 *
 * Usage:
 *   node scripts/swap-hero-banner.js --dry-run   # upload files, show diffs, don't patch
 *   node scripts/swap-hero-banner.js             # full swap
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
for (const line of envText.split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}

const STORE = process.env.SHOPIFY_STORE_DOMAIN
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN
const REST = `https://${STORE}/admin/api/2026-01`
const GQL = `https://${STORE}/admin/api/2026-01/graphql.json`

const DRY_RUN = process.argv.includes('--dry-run')
const REUSE = process.argv.includes('--reuse') // skip upload, use refs from last run

const DESKTOP_PATH = '/Users/wogbot/Desktop/banner/Desktop.webp'
const MOBILE_PATH = '/Users/wogbot/Desktop/banner/Mobile.webp'
const DESKTOP_NAME = 'Hero_Celebrate_New_Life_Desktop.webp'
const MOBILE_NAME = 'Hero_Celebrate_New_Life_Mobile.webp'

const TARGET_BLOCK_ID = 'slide_9djcXh'
const TARGET_FILES = ['templates/index.json', 'templates/index.context.au.json']

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
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`REST ${opts.method || 'GET'} ${urlPath}: ${res.status} — ${txt.slice(0, 300)}`)
  }
  return res.json()
}

async function uploadFile(filePath, filename) {
  const buf = fs.readFileSync(filePath)
  const size = buf.length
  console.log(`  ${filename} (${(size / 1024).toFixed(1)} KB)`)

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

  const form = new FormData()
  for (const p of target.parameters) form.append(p.name, p.value)
  form.append('file', new Blob([buf], { type: 'image/webp' }), filename)
  const upRes = await fetch(target.url, { method: 'POST', body: form })
  if (!upRes.ok && upRes.status !== 201 && upRes.status !== 204) {
    const txt = await upRes.text()
    throw new Error(`Staged upload failed: ${upRes.status} — ${txt.slice(0, 300)}`)
  }

  const created = await gql(`
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { id alt fileStatus ... on MediaImage { id image { url width height } } }
        userErrors { field message }
      }
    }`, {
    files: [{
      alt: filename.replace(/\.[^.]+$/, '').replace(/_/g, ' '),
      contentType: 'IMAGE',
      originalSource: target.resourceUrl
    }]
  })
  const cErrs = created.fileCreate.userErrors
  if (cErrs && cErrs.length) throw new Error('fileCreate: ' + JSON.stringify(cErrs))
  return created.fileCreate.files[0]
}

async function waitForFile(fileGid, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const data = await gql(`
      query($id: ID!) {
        node(id: $id) {
          ... on MediaImage { id fileStatus image { url width height } }
        }
      }`, { id: fileGid })
    const node = data.node
    if (node?.fileStatus === 'READY' && node.image?.url) return node.image
    if (node?.fileStatus === 'FAILED') throw new Error(`File FAILED: ${fileGid}`)
    await new Promise(r => setTimeout(r, 1500))
  }
  throw new Error(`Timeout waiting for ${fileGid}`)
}

async function getActiveTheme() {
  const data = await rest('/themes.json')
  return data.themes.find(t => t.role === 'main')
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

// GraphQL themeFilesUpsert — more forgiving of legacy blocks with missing schemas
async function putAssetGql(themeGid, key, value) {
  const data = await gql(`
    mutation themeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { filename code message }
      }
    }`, {
    themeId: themeGid,
    files: [{ filename: key, body: { type: 'TEXT', value } }]
  })
  const errs = data.themeFilesUpsert.userErrors
  if (errs && errs.length) throw new Error('themeFilesUpsert: ' + JSON.stringify(errs))
  return data.themeFilesUpsert.upsertedThemeFiles
}

async function main() {
  console.log(`Store: ${STORE}`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`)

  // ── 1. Upload files ──
  let desktopImg, mobileImg
  if (REUSE) {
    console.log('Reusing previously uploaded files...')
    desktopImg = { url: 'https://cdn.shopify.com/s/files/1/0584/7410/2873/files/Hero_Celebrate_New_Life_Desktop_b45fb43d-9bd7-41bf-ac1a-a1bd382b3ceb.webp', width: 2048, height: 800 }
    mobileImg = { url: 'https://cdn.shopify.com/s/files/1/0584/7410/2873/files/Hero_Celebrate_New_Life_Mobile_08875adb-276e-4106-af12-ac920733834b.webp', width: 1080, height: 1080 }
  } else {
    console.log('Uploading files to Shopify Files...')
    const [desktopFile, mobileFile] = await Promise.all([
      uploadFile(DESKTOP_PATH, DESKTOP_NAME),
      uploadFile(MOBILE_PATH, MOBILE_NAME)
    ])
    console.log('\nWaiting for processing...')
    ;[desktopImg, mobileImg] = await Promise.all([
      waitForFile(desktopFile.id),
      waitForFile(mobileFile.id)
    ])
  }
  console.log(`  Desktop: ${desktopImg.width}x${desktopImg.height} — ${desktopImg.url}`)
  console.log(`  Mobile:  ${mobileImg.width}x${mobileImg.height} — ${mobileImg.url}`)

  // Build the shopify://shop_images/<filename> reference
  // Shopify stores uploaded file refs by the original filename; verify by URL
  // Extract filename from CDN URL: .../files/<filename>?v=...
  function extractCdnFilename(url) {
    // CDN URL format: https://cdn.shopify.com/s/files/1/xxxx/yyyy/zzzz/files/<filename>?v=...
    // We want just <filename> — the segment after the LAST /files/
    const noQuery = url.split('?')[0]
    const parts = noQuery.split('/files/')
    const last = parts[parts.length - 1]
    return decodeURIComponent(last)
  }
  const desktopCdnName = extractCdnFilename(desktopImg.url) || DESKTOP_NAME
  const mobileCdnName = extractCdnFilename(mobileImg.url) || MOBILE_NAME
  const desktopRef = `shopify://shop_images/${desktopCdnName}`
  const mobileRef = `shopify://shop_images/${mobileCdnName}`
  console.log(`\nTheme references:`)
  console.log(`  image        = ${desktopRef}`)
  console.log(`  mobile_image = ${mobileRef}`)

  // ── 2. Patch theme files ──
  const theme = await getActiveTheme()
  const themeGid = `gid://shopify/OnlineStoreTheme/${theme.id}`
  console.log(`\nActive theme: ${theme.name} (${theme.id})`)

  for (const key of TARGET_FILES) {
    console.log(`\n── ${key} ──`)
    const asset = await getAsset(theme.id, key)
    if (!asset) { console.log(`  [SKIP] asset not found`); continue }
    const json = JSON.parse(asset.value)

    const slideshowKey = Object.keys(json.sections || {}).find(k => json.sections[k].type === 'slideshow')
    if (!slideshowKey) { console.log(`  [SKIP] no slideshow section`); continue }
    const block = json.sections[slideshowKey].blocks?.[TARGET_BLOCK_ID]
    if (!block) { console.log(`  [SKIP] block ${TARGET_BLOCK_ID} not found`); continue }

    console.log(`  OLD image        = ${block.settings.image}`)
    console.log(`  OLD mobile_image = ${block.settings.mobile_image}`)
    block.settings.image = desktopRef
    block.settings.mobile_image = mobileRef
    console.log(`  NEW image        = ${desktopRef}`)
    console.log(`  NEW mobile_image = ${mobileRef}`)

    // Strip orphan tnt_vid_* blocks (no schema, cannot render, blocks PUT validation)
    let strippedCount = 0
    for (const sec of Object.values(json.sections || {})) {
      if (!sec.blocks) continue
      for (const bid of Object.keys(sec.blocks)) {
        if (bid.startsWith('tnt_vid')) {
          delete sec.blocks[bid]
          strippedCount++
        }
      }
      if (Array.isArray(sec.block_order)) {
        sec.block_order = sec.block_order.filter(bid => !bid.startsWith('tnt_vid'))
      }
    }
    if (strippedCount) console.log(`  Stripped ${strippedCount} orphan tnt_vid_* block(s)`)

    if (DRY_RUN) {
      console.log(`  [DRY RUN] skipping PUT`)
      continue
    }
    const newValue = JSON.stringify(json, null, 2)
    try {
      await putAssetGql(themeGid, key, newValue)
      console.log(`  ✅ themeFilesUpsert ok`)
    } catch (e) {
      console.log(`  themeFilesUpsert failed: ${e.message}`)
      console.log(`  falling back to REST PUT...`)
      await putAsset(theme.id, key, newValue)
      console.log(`  ✅ REST PUT ok`)
    }
  }

  console.log('\n✅ Done.')
  console.log('Check https://genderrevealideas.com.au — may need a hard refresh / CDN cache settle (~30s).')
}

main().catch(e => { console.error('FATAL:', e.message || e); process.exit(1) })
