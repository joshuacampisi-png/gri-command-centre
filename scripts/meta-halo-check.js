/**
 * Meta cross-channel halo check.
 * Compare Meta performance same windows as Google audit.
 */
import 'dotenv/config'

const TOKEN = process.env.META_ACCESS_TOKEN
const ACCT = process.env.META_AD_ACCOUNT_ID

async function pull(since, until, label) {
  const url = `https://graph.facebook.com/v20.0/${ACCT}/insights?fields=spend,impressions,clicks,actions,action_values,purchase_roas&time_range={"since":"${since}","until":"${until}"}&access_token=${TOKEN}`
  const r = await fetch(url)
  const j = await r.json()
  const d = j.data?.[0] || {}
  const purchases = (d.actions || []).find(a => a.action_type === 'purchase')?.value || 0
  const purchaseValue = (d.action_values || []).find(a => a.action_type === 'purchase')?.value || 0
  const roas = (d.purchase_roas || []).find(a => a.action_type === 'purchase')?.value || 0
  console.log(`${label} (${since} → ${until})`)
  console.log(`  Spend: $${Number(d.spend || 0).toFixed(0)}`)
  console.log(`  Impressions: ${Number(d.impressions || 0).toLocaleString()}`)
  console.log(`  Clicks: ${d.clicks || 0}`)
  console.log(`  Purchases: ${purchases}`)
  console.log(`  Purchase Value: $${Number(purchaseValue).toFixed(0)}`)
  console.log(`  Purchase ROAS: ${Number(roas).toFixed(2)}x\n`)
  return { spend: Number(d.spend || 0), purchases: Number(purchases), value: Number(purchaseValue), roas: Number(roas) }
}

console.log('=== META HALO CHECK — same windows as Google ===\n')
const w1 = await pull('2026-03-30', '2026-04-12', 'PRE  (W1, 14d before changes)')
const w2 = await pull('2026-04-13', '2026-04-26', 'POST (W2, 14d after changes)')

console.log('--- DELTA ---')
console.log(`Spend: $${(w2.spend - w1.spend).toFixed(0)}`)
console.log(`Purchases: ${(w2.purchases - w1.purchases).toFixed(0)}`)
console.log(`Value: $${(w2.value - w1.value).toFixed(0)}`)
console.log(`ROAS: ${(w2.roas - w1.roas).toFixed(2)}`)
process.exit(0)
