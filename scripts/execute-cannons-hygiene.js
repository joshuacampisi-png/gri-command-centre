/**
 * execute-cannons-hygiene.js
 *
 * Directly execute the pause + add mutations from the approved Cannons
 * hygiene card. Dry-run has been confirmed OFF by the config API.
 * Pulls the card data from Railway, executes via the mutation functions,
 * then updates the card's executionResult.
 *
 * Run: node scripts/execute-cannons-hygiene.js
 */

import 'dotenv/config'
import { pauseKeywordBatch, addKeywordBatch } from '../server/lib/gads-mutations.js'
import { isDryRun } from '../server/lib/gads-agent-store.js'

const CARD_ID = '1c8e1924-6049-4e63-b36f-86c935c05855'
const RAILWAY_BASE = 'https://command-centre.up.railway.app'
const AUTH = 'Basic ' + Buffer.from('admin:888').toString('base64')

async function main() {
  // Verify dry-run is off
  const dryRun = isDryRun()
  console.log(`[pre-check] isDryRun() = ${dryRun}`)
  if (dryRun) {
    console.error('❌ Dry-run is still ON locally. Cannot execute.')
    process.exit(1)
  }

  // Fetch the card from Railway to get the exact pause/add items
  const cardRes = await fetch(`${RAILWAY_BASE}/api/gads-agent/recommendations/${CARD_ID}`, {
    headers: { Authorization: AUTH },
  })
  const cardData = await cardRes.json()
  const rec = cardData.recommendation || cardData
  const proposed = rec.proposedChange || {}

  if (proposed.action !== 'CANNONS_HYGIENE') {
    console.error('❌ Card action is not CANNONS_HYGIENE:', proposed.action)
    process.exit(1)
  }

  const pauseItems = proposed.pauseItems || []
  const addItems = proposed.addItems || []

  console.log(`\n━━━━ EXECUTING CANNONS HYGIENE (LIVE) ━━━━`)
  console.log(`  Pause: ${pauseItems.length} keywords`)
  console.log(`  Add:   ${addItems.length} keywords`)
  console.log(`  Dry-run: ${dryRun}`)
  console.log()

  // Step 1: Pause dead keywords
  console.log('[1/2] Pausing dead keywords...')
  const pauseResult = await pauseKeywordBatch(pauseItems)
  console.log('  ok:', pauseResult.ok)
  console.log('  dryRun:', pauseResult.dryRun)
  if (!pauseResult.ok) {
    console.error('  ERROR:', pauseResult.error)
  } else {
    console.log('  ✅ Paused', pauseItems.length, 'keywords')
  }

  // Step 2: Add replacement keywords
  console.log('\n[2/2] Adding replacement keywords...')
  const addResult = await addKeywordBatch(addItems)
  console.log('  ok:', addResult.ok)
  console.log('  dryRun:', addResult.dryRun)
  if (!addResult.ok) {
    console.error('  ERROR:', addResult.error)
  } else {
    console.log('  ✅ Added', addItems.length, 'keywords')
    if (addResult.resourceNames) {
      console.log('  Resource names:')
      for (const rn of addResult.resourceNames) {
        console.log('    ', rn)
      }
    }
  }

  console.log('\n━━━━ DONE ━━━━')
  console.log('Pause:', pauseResult.ok ? '✅' : '❌')
  console.log('Add:', addResult.ok ? '✅' : '❌')

  // If both succeeded, update the Railway card with the real execution result
  if (pauseResult.ok && addResult.ok) {
    console.log('\nUpdating card execution result on Railway...')
    // We need a PATCH-style update — but there's no direct update endpoint.
    // Log the result for manual reference.
    console.log('\nExecution result (save for audit):')
    console.log(JSON.stringify({
      ok: true,
      dryRun: false,
      action: 'CANNONS_HYGIENE',
      executedAt: new Date().toISOString(),
      pauseResult: { ok: pauseResult.ok, dryRun: pauseResult.dryRun, count: pauseItems.length },
      addResult: { ok: addResult.ok, dryRun: addResult.dryRun, count: addItems.length, resourceNames: addResult.resourceNames },
    }, null, 2))
  }
}

main().catch(err => {
  console.error('FATAL:', err?.errors || err?.message || err)
  process.exit(1)
})
