#!/usr/bin/env node
/**
 * gmb-test.js — dry-run helper for the GMB Auto-Poster Flywheel.
 *
 * Same pipeline as gmb-post-daily.js (queue pick → description pick →
 * postToGmb) but with dryRun:true, so:
 *   - no browser is launched
 *   - nothing is posted to Google
 *   - the queue file is NOT moved into /posted/
 *   - no entries are written to gmb-posted.json (no logPost, no logFailure)
 *
 * Purpose: let Josh sanity-check what would happen on the next cron run
 * without spending a real post slot.
 *
 * Run: node scripts/gmb-test.js
 */

import { readFileSync } from 'fs'
import { dataFile } from '../server/lib/data-dir.js'
import { getNextImage, getCategoryFromFilename } from '../server/lib/gmb-queue.js'
import { pickDescription } from '../server/lib/gmb-descriptions.js'
import { postToGmb } from '../server/lib/gmb-poster.js'

const CONFIG_PATH = dataFile('gmb-config.json')

function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
  } catch (e) {
    throw new Error(`Cannot read ${CONFIG_PATH}: ${e.message}`)
  }
}

async function main() {
  console.log('[gmb-test] DRY RUN — no posts will be sent and no state will change.')
  console.log('')

  const config = loadConfig()

  const image = getNextImage()
  if (!image) {
    console.log('[gmb-test] Queue is empty — nothing would be posted.')
    return 0
  }
  console.log(`[gmb-test] Next image would be: ${image.name}`)
  console.log(`[gmb-test]   path: ${image.path}`)

  const mapping = getCategoryFromFilename(image.name, config.urlMapping)
  if (!mapping) {
    console.log(`[gmb-test] No urlMapping match (and no default) for ${image.name} — would FAIL.`)
    return 0
  }
  const category = mapping.filenameMatch
  console.log(`[gmb-test] Category: ${category}`)
  console.log(`[gmb-test] Button:   ${mapping.button} → ${mapping.url}`)

  const description = pickDescription({ category })
  if (!description) {
    console.log(`[gmb-test] No description available for category "${category}" — would FAIL.`)
    return 0
  }
  console.log(`[gmb-test] Description id: ${description.id}`)
  console.log(`[gmb-test] Description text: ${description.text.slice(0, 200)}${description.text.length > 200 ? '…' : ''}`)
  console.log('')

  const result = await postToGmb({
    imagePath: image.path,
    description: description.text,
    buttonType: mapping.button,
    buttonUrl: mapping.url,
    dryRun: true,
  })

  console.log('[gmb-test] postToGmb(dryRun) returned:')
  console.log(JSON.stringify(result, null, 2))
  console.log('')
  console.log('[gmb-test] ✓ Dry run complete. Queue file NOT moved. State NOT logged.')
  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[gmb-test] FATAL:', err?.message || err)
    process.exit(1)
  })
