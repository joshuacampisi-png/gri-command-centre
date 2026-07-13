/**
 * margin-deriver.js
 *
 * Derives the TRUE blended gross margin from Shopify itself:
 *   - pulls the last N days of orders (line-item level)
 *   - reads each sold variant's "Cost per item" (InventoryItem.unitCost)
 *   - computes the revenue-weighted margin across all non-hire products
 *
 * Hire products are excluded — they carry 100% margin by design in the
 * finance engine. Shipping-protection line items are excluded (not a
 * product). Variants without a cost are reported so Josh's team can fill
 * them in; they're excluded from the weighted blend rather than guessed.
 */
import { env } from './env.js'

const HIRE_IDS = (process.env.HIRE_PRODUCT_IDS || '7988691927129,8205084131417,8216641241177,8137632710745,8145211031641')
  .split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean)

async function adminToken() {
  // Client-credentials token carries the app's full scope set (incl.
  // read_all_orders + inventory access via product variants).
  if (env.shopify.apiKey && env.shopify.apiSecret) {
    const r = await fetch(`https://${env.shopify.storeDomain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: env.shopify.apiKey,
        client_secret: env.shopify.apiSecret,
      }),
    })
    const j = await r.json()
    if (j.access_token) return j.access_token
  }
  return env.shopify.adminAccessToken
}

export async function deriveBlendedMargin({ days = 90 } = {}) {
  const token = await adminToken()
  const H = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' }
  const base = `https://${env.shopify.storeDomain}/admin/api/2025-01`

  // ── 1. Aggregate sold variants over the window ──────────────────────────
  const since = new Date(Date.now() - days * 86400000).toISOString()
  let url = `${base}/orders.json?status=any&created_at_min=${since}&limit=250`
  const agg = new Map()
  let ordersScanned = 0
  for (let page = 0; page < 40 && url; page++) {
    const r = await fetch(url, { headers: H })
    if (r.status === 429) {
      await new Promise(s => setTimeout(s, 2500))
      page--
      continue
    }
    if (!r.ok) throw new Error(`Shopify orders fetch failed (${r.status})`)
    const j = await r.json()
    for (const o of j.orders || []) {
      if (o.cancelled_at || o.financial_status === 'voided') continue
      ordersScanned++
      for (const li of o.line_items || []) {
        if ((li.title || '').toLowerCase().includes('shipping protection')) continue
        if (HIRE_IDS.includes(li.product_id)) continue
        if (!li.variant_id) continue
        const key = String(li.variant_id)
        if (!agg.has(key)) {
          agg.set(key, {
            variantId: key,
            title: `${li.title}${li.variant_title ? ' — ' + li.variant_title : ''}`,
            units: 0, revenue: 0,
            price: parseFloat(li.price || 0),
          })
        }
        const a = agg.get(key)
        a.units += li.quantity || 1
        a.revenue += parseFloat(li.price || 0) * (li.quantity || 1)
      }
    }
    const m = (r.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/)
    url = m ? m[1] : null
  }

  // ── 2. Batch-read unit costs ────────────────────────────────────────────
  const vids = [...agg.keys()]
  const costs = new Map()
  for (let i = 0; i < vids.length; i += 100) {
    const ids = vids.slice(i, i + 100).map(v => `gid://shopify/ProductVariant/${v}`)
    const r = await fetch(`${base}/graphql.json`, {
      method: 'POST', headers: H,
      body: JSON.stringify({
        query: 'query($ids:[ID!]!){nodes(ids:$ids){... on ProductVariant{id inventoryItem{unitCost{amount}}}}}',
        variables: { ids },
      }),
    })
    const j = await r.json()
    if (j.errors) throw new Error(`Shopify GraphQL: ${JSON.stringify(j.errors).slice(0, 150)}`)
    for (const n of j.data?.nodes || []) {
      if (n?.id) {
        const amount = n.inventoryItem?.unitCost?.amount
        costs.set(n.id.split('/').pop(), amount != null ? parseFloat(amount) : null)
      }
    }
    await new Promise(s => setTimeout(s, 600))
  }

  // ── 3. Revenue-weighted blend ───────────────────────────────────────────
  let totalRev = 0, coveredRev = 0, weightedGP = 0
  const missingCosts = []
  const perProduct = []
  for (const [vid, a] of agg) {
    totalRev += a.revenue
    const cost = costs.get(vid)
    if (cost == null || a.price <= 0) {
      if (a.revenue > 200) missingCosts.push({ title: a.title, revenue: Math.round(a.revenue), units: a.units })
      continue
    }
    const margin = (a.price - cost) / a.price
    coveredRev += a.revenue
    weightedGP += a.revenue * margin
    if (a.revenue > 200) {
      perProduct.push({
        title: a.title, units: a.units, revenue: Math.round(a.revenue),
        price: a.price, cost, marginPct: Math.round(margin * 1000) / 10,
      })
    }
  }

  const blended = coveredRev > 0 ? weightedGP / coveredRev : null
  return {
    ok: blended != null,
    days,
    ordersScanned,
    blendedMargin: blended != null ? Math.round(blended * 1000) / 1000 : null,
    blendedMarginPct: blended != null ? Math.round(blended * 1000) / 10 : null,
    coveragePct: totalRev > 0 ? Math.round((coveredRev / totalRev) * 100) : 0,
    productRevenue: Math.round(totalRev),
    coveredRevenue: Math.round(coveredRev),
    perProduct: perProduct.sort((a, b) => b.revenue - a.revenue).slice(0, 25),
    missingCosts: missingCosts.sort((a, b) => b.revenue - a.revenue).slice(0, 15),
    derivedAt: new Date().toISOString(),
  }
}
