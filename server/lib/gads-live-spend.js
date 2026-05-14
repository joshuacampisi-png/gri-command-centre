/**
 * gads-live-spend.js
 *
 * Live Google Ads spend + conversion pull via the official Google Ads API
 * (using the existing gads-client singleton). Replaces the broken Google
 * Ads Script webhook for Flywheel reporting.
 *
 * SCOPE: spend, clicks, impressions, conversions, conversion_value at the
 * account level for a date range. Per-campaign rollups are exposed as a
 * second function for any caller that wants to drill in.
 *
 * Caching: in-memory 5 minute TTL keyed by the date range so the Flywheel
 * UI can re-poll cheaply.
 */
import { getGadsCustomer, isGadsConfigured, microsToDollars } from './gads-client.js'

const CACHE = new Map()
const TTL_MS = 5 * 60 * 1000

function ymd(d) { return d.toISOString().slice(0, 10) }

function dateWindow(preset) {
  const now = new Date()
  const end = new Date(now)
  const start = new Date(now)
  switch (preset) {
    case 'today':
      // start = today
      break
    case 'yesterday':
      start.setDate(start.getDate() - 1)
      end.setDate(end.getDate() - 1)
      break
    case 'last_7d':
      start.setDate(start.getDate() - 6); break
    case 'last_14d':
      start.setDate(start.getDate() - 13); break
    case 'last_30d':
      start.setDate(start.getDate() - 29); break
    default:
      start.setDate(start.getDate() - 6)
  }
  return { since: ymd(start), until: ymd(end) }
}

/**
 * Pull account-level totals for the given date preset.
 * Returns { ok, spend, clicks, impressions, conversions, conversionValue,
 *           since, until, fetchedAt, error? }
 */
export async function fetchLiveGoogleSpend(preset = 'today') {
  if (!isGadsConfigured()) {
    return { ok: false, spend: 0, clicks: 0, impressions: 0, conversions: 0, conversionValue: 0, error: 'Google Ads API not configured (missing GOOGLE_ADS_* env vars)', preset, fetchedAt: new Date().toISOString() }
  }

  const { since, until } = dateWindow(preset)
  const cacheKey = `acct:${since}:${until}`
  const cached = CACHE.get(cacheKey)
  if (cached && Date.now() - cached.t < TTL_MS) return cached.v

  try {
    const customer = getGadsCustomer()
    const rows = await customer.query(`
      SELECT
        metrics.cost_micros,
        metrics.clicks,
        metrics.impressions,
        metrics.conversions,
        metrics.conversions_value,
        segments.date
      FROM customer
      WHERE segments.date BETWEEN '${since}' AND '${until}'
    `)
    let spendMicros = 0n, clicks = 0, impressions = 0, conv = 0, convValue = 0
    for (const r of rows) {
      const m = r.metrics || {}
      spendMicros += BigInt(m.cost_micros || 0)
      clicks      += Number(m.clicks || 0)
      impressions += Number(m.impressions || 0)
      conv        += Number(m.conversions || 0)
      convValue   += Number(m.conversions_value || 0)
    }
    const out = {
      ok: true,
      spend: microsToDollars(spendMicros),
      clicks,
      impressions,
      conversions: Math.round(conv * 100) / 100,
      conversionValue: Math.round(convValue * 100) / 100,
      since, until, preset,
      fetchedAt: new Date().toISOString(),
    }
    CACHE.set(cacheKey, { t: Date.now(), v: out })
    return out
  } catch (err) {
    const msg = err?.errors?.[0]?.message || err?.message || String(err)
    return { ok: false, spend: 0, clicks: 0, impressions: 0, conversions: 0, conversionValue: 0, error: msg, preset, since, until, fetchedAt: new Date().toISOString() }
  }
}

/**
 * Per-campaign breakdown for a date preset. Returns array of
 *   { campaignId, campaignName, status, spend, clicks, impressions, conversions, conversionValue }
 */
export async function fetchLiveGoogleSpendByCampaign(preset = 'last_7d') {
  if (!isGadsConfigured()) return { ok: false, campaigns: [], error: 'Google Ads API not configured' }

  const { since, until } = dateWindow(preset)
  const cacheKey = `camp:${since}:${until}`
  const cached = CACHE.get(cacheKey)
  if (cached && Date.now() - cached.t < TTL_MS) return cached.v

  try {
    const customer = getGadsCustomer()
    const rows = await customer.query(`
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        metrics.cost_micros,
        metrics.clicks,
        metrics.impressions,
        metrics.conversions,
        metrics.conversions_value
      FROM campaign
      WHERE segments.date BETWEEN '${since}' AND '${until}'
    `)
    const agg = new Map()
    for (const r of rows) {
      const id = String(r.campaign?.id || '')
      if (!id) continue
      if (!agg.has(id)) {
        agg.set(id, {
          campaignId: id,
          campaignName: r.campaign?.name || `#${id}`,
          status: r.campaign?.status || 'UNKNOWN',
          spendMicros: 0n,
          clicks: 0, impressions: 0, conversions: 0, conversionValue: 0,
        })
      }
      const a = agg.get(id)
      const m = r.metrics || {}
      a.spendMicros     += BigInt(m.cost_micros || 0)
      a.clicks          += Number(m.clicks || 0)
      a.impressions     += Number(m.impressions || 0)
      a.conversions     += Number(m.conversions || 0)
      a.conversionValue += Number(m.conversions_value || 0)
    }
    const campaigns = Array.from(agg.values()).map(a => ({
      campaignId: a.campaignId,
      campaignName: a.campaignName,
      status: a.status,
      spend: microsToDollars(a.spendMicros),
      clicks: a.clicks,
      impressions: a.impressions,
      conversions: Math.round(a.conversions * 100) / 100,
      conversionValue: Math.round(a.conversionValue * 100) / 100,
    })).sort((a, b) => b.spend - a.spend)

    const out = { ok: true, campaigns, since, until, preset, fetchedAt: new Date().toISOString() }
    CACHE.set(cacheKey, { t: Date.now(), v: out })
    return out
  } catch (err) {
    const msg = err?.errors?.[0]?.message || err?.message || String(err)
    return { ok: false, campaigns: [], error: msg, preset, fetchedAt: new Date().toISOString() }
  }
}
