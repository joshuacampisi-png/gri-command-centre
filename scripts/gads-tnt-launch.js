/**
 * gads-tnt-launch.js
 * Add missing assets to TNT Hire PMAX, set budget, enable campaign.
 */
import 'dotenv/config'
import { readFileSync } from 'fs'
import { getGadsCustomer, getGadsCustomerId } from '../server/lib/gads-client.js'

const custId = getGadsCustomerId()
const CAMPAIGN_ID = '22941692140'
const ASSET_GROUP_ID = '6605420386'
const BUDGET_RN = 'customers/9431746480/campaignBudgets/14867679572'

async function main() {
  const customer = getGadsCustomer()
  console.log('=== TNT HIRE PMAX LAUNCH ===\n')

  // ── Step 1: Create description text assets ──────────────────────────────
  console.log('[1] Creating description assets...')
  const descriptions = [
    "Hire our TNT reveal kit packed with powder and confetti. Pink or blue, delivered Australia wide. Book today and make your gender reveal unforgettable.",
    "Australia's most epic gender reveal experience. Our TNT kit fires vibrant powder and confetti for the ultimate wow moment. Easy self hire, no fuss.",
    "Book your TNT gender reveal kit online. Choose pink, blue or keep it a surprise. Everything included, just push the plunger and celebrate!",
    "Create a jaw dropping gender reveal moment with our self hire TNT kit. Eco friendly, Aussie made, and guaranteed to impress your guests.",
  ]

  const descAssetRNs = []
  for (const desc of descriptions) {
    try {
      const res = await customer.assets.create([{
        name: `TNT Desc - ${desc.substring(0, 30)}`,
        type: 'TEXT',
        text_asset: { text: desc },
      }])
      const rn = res?.results?.[0]?.resource_name
      descAssetRNs.push(rn)
      console.log(`  ✓ Created: "${desc.substring(0, 50)}..."`)
    } catch (err) {
      console.error(`  ✗ Failed: ${err?.errors?.[0]?.message || err.message}`)
    }
  }

  // ── Step 2: Upload logo image asset ─────────────────────────────────────
  console.log('\n[2] Uploading logo asset...')
  const logoBytes = readFileSync('/tmp/gri-logo-square.png')
  const logoBase64 = logoBytes.toString('base64')

  let logoAssetRN = null
  try {
    const res = await customer.assets.create([{
      name: 'GRI Logo Square',
      type: 'IMAGE',
      image_asset: { data: logoBase64 },
    }])
    logoAssetRN = res?.results?.[0]?.resource_name
    console.log(`  ✓ Logo uploaded: ${logoAssetRN}`)
  } catch (err) {
    console.error(`  ✗ Logo failed: ${err?.errors?.[0]?.message || err.message}`)
  }

  // Also upload landscape logo
  console.log('\n[2b] Uploading landscape logo...')
  const landscapeBytes = readFileSync('/tmp/gri-logo.png')
  const landscapeBase64 = landscapeBytes.toString('base64')

  let landscapeLogoRN = null
  try {
    const res = await customer.assets.create([{
      name: 'GRI Logo Landscape',
      type: 'IMAGE',
      image_asset: { data: landscapeBase64 },
    }])
    landscapeLogoRN = res?.results?.[0]?.resource_name
    console.log(`  ✓ Landscape logo uploaded: ${landscapeLogoRN}`)
  } catch (err) {
    console.error(`  ✗ Landscape logo failed: ${err?.errors?.[0]?.message || err.message}`)
  }

  // ── Step 3: Link assets to asset group ──────────────────────────────────
  console.log('\n[3] Linking assets to TNT asset group...')
  const assetGroupRN = `customers/${custId}/assetGroups/${ASSET_GROUP_ID}`

  // Link descriptions (field_type DESCRIPTION = 4)
  for (const rn of descAssetRNs) {
    if (!rn) continue
    try {
      await customer.assetGroupAssets.create([{
        asset_group: assetGroupRN,
        asset: rn,
        field_type: 'DESCRIPTION',
      }])
      console.log(`  ✓ Description linked`)
    } catch (err) {
      console.error(`  ✗ Desc link failed: ${err?.errors?.[0]?.message || err.message}`)
    }
  }

  // Link square logo (field_type LOGO = 8)
  if (logoAssetRN) {
    try {
      await customer.assetGroupAssets.create([{
        asset_group: assetGroupRN,
        asset: logoAssetRN,
        field_type: 'LOGO',
      }])
      console.log(`  ✓ Square logo linked`)
    } catch (err) {
      console.error(`  ✗ Logo link failed: ${err?.errors?.[0]?.message || err.message}`)
    }
  }

  // Link landscape logo (field_type LANDSCAPE_LOGO = 19... or try LOGO)
  if (landscapeLogoRN) {
    try {
      await customer.assetGroupAssets.create([{
        asset_group: assetGroupRN,
        asset: landscapeLogoRN,
        field_type: 'LANDSCAPE_LOGO',
      }])
      console.log(`  ✓ Landscape logo linked`)
    } catch (err) {
      console.error(`  ✗ Landscape logo link failed: ${err?.errors?.[0]?.message || err.message}`)
    }
  }

  // ── Step 4: Set budget to $15/day ───────────────────────────────────────
  console.log('\n[4] Setting budget to $15/day...')
  try {
    await customer.campaignBudgets.update([{
      resource_name: BUDGET_RN,
      amount_micros: 15_000_000,
    }])
    console.log('  ✓ Budget set to $15/day')
  } catch (err) {
    console.error(`  ✗ Budget failed: ${err?.errors?.[0]?.message || err.message}`)
  }

  // ── Step 5: Enable campaign ─────────────────────────────────────────────
  console.log('\n[5] Enabling campaign...')
  try {
    await customer.campaigns.update([{
      resource_name: `customers/${custId}/campaigns/${CAMPAIGN_ID}`,
      status: 'ENABLED',
    }])
    console.log('  ✓ CAMPAIGN IS LIVE!')
  } catch (err) {
    console.error(`  ✗ Enable failed: ${err?.errors?.[0]?.message || err.message}`)
  }

  // ── Verify ──────────────────────────────────────────────────────────────
  console.log('\n[6] Verifying...')
  const verify = await customer.query(`
    SELECT campaign.name, campaign.status, campaign_budget.amount_micros
    FROM campaign WHERE campaign.id = ${CAMPAIGN_ID}
  `)
  for (const r of verify) {
    const status = r.campaign?.status === 2 ? 'ENABLED' : r.campaign?.status
    console.log(`  ${r.campaign?.name} | Status: ${status} | Budget: $${Number(r.campaign_budget?.amount_micros) / 1e6}/day`)
  }

  console.log('\n=== TNT HIRE IS LIVE ===')
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
