/**
 * Competitor Tracker
 * Scrapes Google.com.au organic rankings for each keyword.
 * Compares GRI vs 3 competitors head-to-head.
 *
 * Competitors:
 *   CelebrationHQ         — celebrationhq.com.au
 *   Aussie Reveals        — aussiereveals.com.au
 *   Gender Reveal Express — genderrevealexpress.com.au
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dataFile } from './data-dir.js'

const COMP_FILE     = dataFile('competitor-cache.json')
const LOG_FILE      = dataFile('competitor.log')

export const COMPETITORS = {
  gri:     { name: 'Gender Reveal Ideas', domain: 'genderrevealideas.com.au',    color: '#ef4444' },
  cel:     { name: 'CelebrationHQ',       domain: 'celebrationhq.com.au',        color: '#6366f1' },
  aussie:  { name: 'Aussie Reveals',      domain: 'aussiereveals.com.au',        color: '#f97316' },
  express: { name: 'Gender Reveal Express', domain: 'genderrevealexpress.com.au', color: '#eab308' },
}

const DOMAINS = Object.values(COMPETITORS).map(c => c.domain)

function log(msg) {
  const line = `[${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })}] ${msg}\n`
  try { writeFileSync(LOG_FILE, line, { flag: 'a' }) } catch {}
  console.log('[Competitor]', msg)
}

// ── Cache ──────────────────────────────────────────────────────────────────

export function readCompetitorCache() {
  try {
    if (!existsSync(COMP_FILE)) return null
    return JSON.parse(readFileSync(COMP_FILE, 'utf8'))
  } catch { return null }
}

export function writeCompetitorCache(data) {
  writeFileSync(COMP_FILE, JSON.stringify(data, null, 2))
}

// ── Google SERP scraper ────────────────────────────────────────────────────

async function scrapeGoogleRank(page, keyword) {
  const url = `https://www.google.com.au/search?q=${encodeURIComponent(keyword)}&num=30&hl=en&gl=au`

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })

  // Short random delay to be polite
  await page.waitForTimeout(800 + Math.random() * 600)

  // Extract organic result domains + positions
  const results = await page.evaluate((domains) => {
    const items = []
    const selectors = [
      'div.g',
      'div[data-sokoban-container]',
      'div[jscontroller] > div > div.g',
    ]

    // Try to get all result cards
    let cards = document.querySelectorAll('div.g')
    if (cards.length === 0) cards = document.querySelectorAll('[data-hveid]')

    let position = 0
    cards.forEach(card => {
      // Skip ads
      if (card.closest('[data-text-ad]') || card.querySelector('[data-text-ad]')) return
      if (card.querySelector('.ads-ad')) return

      const link = card.querySelector('a[href]')
      if (!link) return

      const href = link.href || ''
      if (!href.startsWith('http')) return

      position++
      try {
        const domain = new URL(href).hostname.replace('www.', '')
        items.push({ position, domain, url: href })
      } catch {}
    })

    return items
  }, DOMAINS)

  // Find each competitor's position
  const positions = {}
  for (const [key, comp] of Object.entries(COMPETITORS)) {
    const match = results.find(r => r.domain.includes(comp.domain.replace('www.', '')))
    positions[key] = match ? { rank: match.position, url: match.url } : { rank: null, url: null }
  }

  return { keyword, positions, scrapedAt: new Date().toISOString() }
}

// ── Full competitor scan ───────────────────────────────────────────────────

export async function runCompetitorScan(keywords) {
  log(`Starting competitor scan for ${keywords.length} keywords`)

  // Deduplicate keywords
  const unique = [...new Set(keywords.map(k => k.keyword || k))]
    .filter(Boolean)
    .slice(0, 40) // cap at 40 to be respectful to Google

  let browser
  const results = []

  try {
    const { chromium } = await import('playwright')
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
    })

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-AU',
      geolocation: { latitude: -27.4698, longitude: 153.0251 }, // Brisbane
      permissions: ['geolocation'],
    })

    const page = await context.newPage()

    for (let i = 0; i < unique.length; i++) {
      const kw = unique[i]
      try {
        log(`Scanning [${i + 1}/${unique.length}]: "${kw}"`)
        const result = await scrapeGoogleRank(page, kw)
        results.push(result)

        // Polite delay between searches: 2-4 seconds
        if (i < unique.length - 1) {
          await page.waitForTimeout(2000 + Math.random() * 2000)
        }
      } catch (e) {
        log(`Failed to scan "${kw}": ${e.message}`)
        results.push({
          keyword: kw,
          positions: Object.fromEntries(Object.keys(COMPETITORS).map(k => [k, { rank: null, url: null }])),
          error: e.message,
          scrapedAt: new Date().toISOString(),
        })
      }
    }

    await browser.close()
    browser = null

  } catch (e) {
    if (browser) await browser.close().catch(() => {})
    log(`Browser error: ${e.message}`)
    throw e
  }

  // Compute summary stats
  const summary = {}
  for (const key of Object.keys(COMPETITORS)) {
    const ranked = results.filter(r => r.positions[key]?.rank !== null)
    const top3   = ranked.filter(r => r.positions[key].rank <= 3).length
    const top10  = ranked.filter(r => r.positions[key].rank <= 10).length
    const avg    = ranked.length > 0
      ? Math.round(ranked.reduce((s, r) => s + r.positions[key].rank, 0) / ranked.length)
      : null
    summary[key] = { ranked: ranked.length, top3, top10, avgRank: avg }
  }

  const cache = {
    updatedAt:  new Date().toISOString(),
    keywords:   results,
    summary,
    competitors: COMPETITORS,
  }

  writeCompetitorCache(cache)
  log(`Scan complete: ${results.length} keywords, ${results.filter(r => !r.error).length} successful`)
  return cache
}
