import { readFile, writeFile } from 'node:fs/promises'
import { dataFile } from './data-dir.js'

const storePath = dataFile('shopify-oauth.json')

export async function loadShopifyOAuthState() {
  try {
    const raw = await readFile(storePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return { nonce: '', accessToken: '', scope: '', connectedAt: '', shop: '' }
  }
}

export async function saveShopifyOAuthState(data) {
  const current = await loadShopifyOAuthState()
  const next = { ...current, ...data }
  await writeFile(storePath, JSON.stringify(next, null, 2), 'utf8')
  return next
}
