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
 * Branches on config.descriptionMode the same way the cron does:
 *   - 'static'    → pickDescription() from the existing 30-variant pool
 *   - 'ai-openai' → buildAiPromptPreview() (read-only — NEVER spends
 *                   tokens). Prints exactly what would be sent to GPT-4o
 *                   so staff can sanity-check the grounded prompt and
 *                   estimated cost without burning OpenAI credits.
 *
 * Purpose: let Josh sanity-check what would happen on the next cron run
 * without spending a real post slot or any OpenAI tokens.
 *
 * Run: node scripts/gmb-test.js
 */

import { readFileSync } from 'fs'
import { dataFile } from '../server/lib/data-dir.js'
import { getNextImage, getCategoryFromFilename } from '../server/lib/gmb-queue.js'
import { pickDescription } from '../server/lib/gmb-descriptions.js'
import { buildAiPromptPreview } from '../server/lib/gmb-ai-describer.js'
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
  const mode = config.descriptionMode || 'static'
  console.log(`[gmb-test] Description mode: ${mode}`)
  console.log('')

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
  console.log('')

  let descriptionText = null
  let descriptionLabel = null

  if (mode === 'ai-openai') {
    // buildAiPromptPreview is read-only — it assembles the prompt and the
    // grounding site content but does NOT call OpenAI. Lets us show staff
    // exactly what would be sent without spending tokens.
    let preview
    try {
      preview = await buildAiPromptPreview({
        imagePath: image.path,
        imageName: image.name,
        category,
        buttonUrl: mapping.url,
      })
    } catch (e) {
      console.log(`[gmb-test] buildAiPromptPreview failed: ${e?.message || e}`)
      console.log('[gmb-test] On a real run the poster would fall back to the static pool.')
      return 0
    }

    const fetched = preview?.siteContent?.fetched
    const fetchedBytes = preview?.siteContent?.bytes || 0
    const groundedUrl = preview?.groundedUrl || mapping.url
    const promptText = preview?.prompt || ''
    const estCost = typeof preview?.estimatedCostUsd === 'number'
      ? preview.estimatedCostUsd
      : 0

    console.log('WOULD GENERATE via OpenAI GPT-4o:')
    console.log(`  Image: ${image.name}`)
    console.log(`  Grounded in: ${groundedUrl}`)
    console.log(`  Site content fetched: ${fetched ? 'yes' : 'no'}, ${fetchedBytes} bytes`)
    console.log(`  Estimated cost: ~$${estCost.toFixed(4)}`)
    console.log(`  Prompt (first 400 chars): ${promptText.slice(0, 400)}${promptText.length > 400 ? '…' : ''}`)
    console.log('')

    // The real run would use the AI output; for the dry-run we still want
    // to exercise postToGmb's selection-pipeline check, so pass through a
    // stand-in description string the poster can accept.
    descriptionText = '[AI preview — no description generated in dry-run]'
    descriptionLabel = 'openai-gpt-4o (preview)'
  } else {
    const description = pickDescription({ category })
    if (!description) {
      console.log(`[gmb-test] No description available for category "${category}" — would FAIL.`)
      return 0
    }
    console.log(`[gmb-test] Description id: ${description.id}`)
    console.log(`[gmb-test] Description text: ${description.text.slice(0, 200)}${description.text.length > 200 ? '…' : ''}`)
    console.log('')
    descriptionText = description.text
    descriptionLabel = description.id
  }

  const result = await postToGmb({
    imagePath: image.path,
    description: descriptionText,
    buttonType: mapping.button,
    buttonUrl: mapping.url,
    dryRun: true,
  })

  console.log(`[gmb-test] postToGmb(dryRun) returned (description source: ${descriptionLabel}):`)
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
