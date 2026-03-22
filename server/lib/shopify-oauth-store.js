import { mkdir, readFile, writeFile } from 'node:fs/promises'

const storePath = '/Users/wogbot/.openclaw/workspace/command-centre-app/.shopify-oauth.json'

async function ensureDir() {
  await mkdir('/Users/wogbot/.openclaw/workspace/command-centre-app', { recursive: true })
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
