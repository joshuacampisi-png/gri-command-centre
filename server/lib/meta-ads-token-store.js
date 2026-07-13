/**
 * meta-ads-token-store.js
 *
 * Volume-persisted store for the Meta MARKETING API token (ads data), the
 * counterpart of meta-connect's Instagram page token store. Exists because
 * the ads token gets rotated whenever Meta invalidates sessions, and env
 * vars (local .env vs Railway variables) kept drifting apart — the finance
 * dashboard silently computed with $0 Meta spend when Railway's env token
 * went stale.
 *
 * Security: setAdsToken() only accepts a token after proving it can read
 * THIS ad account (act_1519116685663528). A random attacker's token fails
 * that check, which is what makes the public setter endpoint safe.
 */
import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs'
import { dataFile } from './data-dir.js'

const STORE_FILE = dataFile('meta-ads-token.json')
const AD_ACCOUNT = 'act_1519116685663528'

let _cached = null

export function getAdsToken() {
  if (_cached !== null) return _cached
  try {
    if (existsSync(STORE_FILE)) {
      const j = JSON.parse(readFileSync(STORE_FILE, 'utf8'))
      _cached = j.token || ''
      return _cached
    }
  } catch { /* fall through */ }
  _cached = ''
  return _cached
}

export async function validateAdsToken(token) {
  const r = await fetch(`https://graph.facebook.com/v20.0/${AD_ACCOUNT}?fields=id,name&access_token=${encodeURIComponent(token)}`)
  const j = await r.json().catch(() => ({}))
  if (j.error) return { valid: false, error: j.error.message }
  return { valid: true, accountName: j.name || AD_ACCOUNT }
}

export async function setAdsToken(token) {
  const check = await validateAdsToken(token)
  if (!check.valid) {
    throw new Error(`Token rejected — cannot read ${AD_ACCOUNT}: ${check.error}`)
  }
  const tmp = `${STORE_FILE}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify({ token, savedAt: new Date().toISOString() }, null, 2))
  renameSync(tmp, STORE_FILE)
  _cached = token
  return check
}

export async function adsTokenStatus() {
  const stored = getAdsToken()
  const envToken = process.env.META_ACCESS_TOKEN || ''
  const active = stored || envToken
  if (!active) return { source: 'none', valid: false }
  const check = await validateAdsToken(active)
  return {
    source: stored ? 'store' : 'env',
    valid: check.valid,
    accountName: check.accountName || null,
    error: check.error || null,
    tokenTail: active.slice(-4),
  }
}
