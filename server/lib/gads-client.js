/**
 * gads-client.js
 * google-ads-api v23 client singleton for the GRI ad account.
 * MCC login + ad account customer_id wiring mirrors scripts/test-google-ads.js,
 * which is the canonical verified connection pattern.
 */
import { GoogleAdsApi } from 'google-ads-api'

let _client = null
let _customer = null

function readEnv() {
  return {
    developerToken:    process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    clientId:          process.env.GOOGLE_ADS_CLIENT_ID,
    clientSecret:      process.env.GOOGLE_ADS_CLIENT_SECRET,
    refreshToken:      process.env.GOOGLE_ADS_REFRESH_TOKEN,
    loginCustomerId:   process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    customerId:        process.env.GOOGLE_ADS_CUSTOMER_ID,
  }
}

export function isGadsConfigured() {
  const e = readEnv()
  return !!(e.developerToken && e.clientId && e.clientSecret && e.refreshToken && e.customerId)
}

export function getGadsClient() {
  if (_client) return _client
  const e = readEnv()
  if (!isGadsConfigured()) {
    throw new Error('[GadsClient] Missing one or more GOOGLE_ADS_* env vars')
  }
  _client = new GoogleAdsApi({
    client_id:       e.clientId,
    client_secret:   e.clientSecret,
    developer_token: e.developerToken,
  })
  return _client
}

export function getGadsCustomer() {
  if (_customer) return _customer
  const e = readEnv()
  const client = getGadsClient()
  _customer = client.Customer({
    customer_id:       e.customerId,
    login_customer_id: e.loginCustomerId,
    refresh_token:     e.refreshToken,
  })
  return _customer
}

export function getGadsCustomerId() {
  return process.env.GOOGLE_ADS_CUSTOMER_ID || ''
}

/**
 * Smoke test: run a tiny GAQL query to confirm the credential chain is live.
 * Returns { ok: true } or { ok: false, error: '...' }.
 */
export async function pingGads() {
  try {
    const customer = getGadsCustomer()
    const rows = await customer.query(`
      SELECT customer.id, customer.descriptive_name
      FROM customer
      LIMIT 1
    `)
    return { ok: true, rows: rows.length, name: rows?.[0]?.customer?.descriptive_name || null }
  } catch (err) {
    return { ok: false, error: err?.errors?.[0]?.message || err?.message || String(err) }
  }
}

export function microsToDollars(micros) {
  if (micros == null) return 0
  const n = typeof micros === 'bigint' ? Number(micros) : Number(micros)
  return n / 1_000_000
}

export function dollarsToMicros(aud) {
  return Math.round((Number(aud) || 0) * 1_000_000)
}
