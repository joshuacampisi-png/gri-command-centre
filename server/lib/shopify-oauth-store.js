import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const DATA_DIR = join(process.cwd(), 'data')
const storePath = join(DATA_DIR, 'shopify-oauth.json')

async function ensureDir() {
  await mkdir(DATA_DIR, { recursive: true })
}

export async function loadShopifyOAuthState() {
  try {
    const raw = await readFile(storePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return { nonce: '', accessToken: '', scope: '', connectedAt: '', shop: '' }
  }
}

export async function saveShopifyOAuthState(data) {
  await ensureDir()
  const current = await loadShopifyOAuthState()
  const next = { ...current, ...data }
  await writeFile(storePath, JSON.stringify(next, null, 2), 'utf8')
  return next
}
