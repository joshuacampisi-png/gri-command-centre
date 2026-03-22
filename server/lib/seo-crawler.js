/**
 * SEO Page Crawler — GRI ONLY
 * PABLO SYSTEM UPDATE — 18 March 2026
 * Crawls GRI Shopify storefront pages and extracts SEO data.
 * Lionzen/GBU paused until GRI system proven.
 * Outputs structured findings → lodged as tasks in Notion (with dedup).
 */

import { createFinding, createTask } from '../connectors/notion.js'

const STORES = {
  GRI: 'https://genderrevealideas.com.au',
}

// Comprehensive page audit list — expanded from 6 to 20+ pages for full audit
const AUDIT_PATHS = {
  GRI: [
    // Core pages
    '/',
    '/collections/all',
    // High-traffic collection pages
    '/collections/gender-reveal-cannons',
    '/collections/gender-reveal-powder',
    '/collections/gender-reveal-confetti',
    '/collections/balloon-kits',
    '/collections/gender-reveal-balloons-decor',
    '/collections/gender-reveal-smoke-bombs-australia',
    '/collections/powder-gender-reveals',
    '/collections/best-gender-reveal-ideas',
    '/collections/gender-reveal-kits',
    '/collections/gender-reveal-games',
    '/collections/gender-reveal-decorations',
    '/collections/gender-reveal-cakes',
    '/collections/gender-reveal-confetti-cannons',
    // Info pages
    '/pages/about-us',
    '/pages/contact',
    '/pages/faqs',
    '/pages/shipping',
    // Blog
    '/blogs/news',
    // Cart / key funnel pages
    '/policies/refund-policy',
  ],
}

async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'PabloEscobot-SEOAudit/1.0' },
      signal: AbortSignal.timeout(12000)
    })
    if (!res.ok) return { url, error: `HTTP ${res.status}`, html: '' }
    const html = await res.text()
    return { url, html, status: res.status }
  } catch (e) {
    return { url, error: e.message, html: '' }
  }
}

function extractSEOData(url, html) {
  const findings = []
  const path = url.replace(/^https?:\/\/[^/]+/, '') || '/'

  // ── Title tag ──
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim() : ''
  if (!title) {
    findings.push({ type: 'SEO', severity: 'High', issue: 'Missing title tag', page: path })
  } else if (title.length < 30) {
    findings.push({ type: 'SEO', severity: 'High', issue: `Title too short (${title.length} chars)`, page: path })
  } else if (title.length > 65) {
    findings.push({ type: 'SEO', severity: 'Medium', issue: `Title too long (${title.length} chars)`, page: path })
  }

  // ── Meta description ──
  const metaDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)
  const metaDesc = metaDescMatch ? metaDescMatch[1].trim() : ''
  if (!metaDesc) {
    findings.push({ type: 'SEO', severity: 'High', issue: 'Missing meta description', page: path })
  } else if (metaDesc.length < 120) {
    findings.push({ type: 'SEO', severity: 'Medium', issue: `Meta description too short (${metaDesc.length} chars)`, page: path })
  } else if (metaDesc.length > 165) {
    findings.push({ type: 'SEO', severity: 'Low', issue: `Meta description too long (${metaDesc.length} chars)`, page: path })
  }

  // ── H1 ──
  const h1Matches = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/gi) || []
  const h1Texts = h1Matches.map(h => h.replace(/<[^>]+>/g, '').trim())
  if (h1Matches.length === 0) {
    findings.push({ type: 'SEO', severity: 'High', issue: 'Missing H1 tag', page: path })
  } else if (h1Matches.length > 1) {
    findings.push({ type: 'SEO', severity: 'Medium', issue: `Multiple H1 tags (${h1Matches.length}) — only one allowed per page`, page: path })
  } else if (h1Texts[0] && h1Texts[0] !== h1Texts[0].replace(/[a-z]/, c => c.toUpperCase())) {
    // Check for title case issues (lowercase first letter is a signal)
    const firstWord = h1Texts[0].split(' ')[0]
    if (firstWord && firstWord[0] === firstWord[0].toLowerCase() && firstWord[0] !== firstWord[0].toUpperCase()) {
      findings.push({ type: 'SEO', severity: 'Low', issue: `H1 capitalisation issue: "${h1Texts[0]}"`, page: path })
    }
  }

  // ── Images missing alt text ──
  const imgMatches = html.match(/<img[^>]+>/gi) || []
  const missingAlt = imgMatches.filter(img => !img.match(/alt=["'][^"']+["']/i)).length
  if (missingAlt > 0) {
    findings.push({ type: 'SEO', severity: 'Medium', issue: `${missingAlt} image(s) missing alt text`, page: path })
  }

  // ── Canonical tag ──
  if (!html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)) {
    findings.push({ type: 'SEO', severity: 'Medium', issue: 'Missing canonical link tag', page: path })
  }

  // ── Open Graph ──
  if (!html.includes('og:title')) {
    findings.push({ type: 'SEO', severity: 'Low', issue: 'Missing Open Graph og:title tag', page: path })
  }
  if (!html.includes('og:description')) {
    findings.push({ type: 'SEO', severity: 'Low', issue: 'Missing Open Graph og:description tag', page: path })
  }
  if (!html.includes('og:image')) {
    findings.push({ type: 'SEO', severity: 'Low', issue: 'Missing Open Graph og:image tag', page: path })
  }

  // ── Schema markup ──
  if (!html.includes('application/ld+json')) {
    findings.push({ type: 'SEO', severity: 'Medium', issue: 'No JSON-LD schema markup found', page: path })
  }

  // ── Viewport meta ──
  if (!html.match(/<meta[^>]+name=["']viewport["']/i)) {
    findings.push({ type: 'SEO', severity: 'High', issue: 'Missing viewport meta tag — mobile SEO critical', page: path })
  }

  return {
    url, path, title, metaDesc,
    h1Count: h1Matches.length, h1Text: h1Texts[0] || '',
    imgCount: imgMatches.length, missingAlt,
    findings
  }
}

export async function runSEOCrawl(company = 'GRI') {
  // GRI ONLY rule — reject any other company
  if (company !== 'GRI') {
    console.log(`[SEO Crawler] BLOCKED: ${company} is paused (GRI only per PABLO SYSTEM UPDATE)`)
    return { ok: false, error: `${company} is paused — GRI only until system proven` }
  }

  const baseUrl = STORES[company]
  const paths = AUDIT_PATHS[company] || ['/']
  if (!baseUrl) return { ok: false, error: `Unknown company: ${company}` }

  console.log(`[SEO Crawler] Starting full audit for ${company} (${paths.length} pages)`)
  const results = []
  const allFindings = []

  for (const path of paths) {
    const url = baseUrl + path
    const { html, error } = await fetchPage(url)
    if (error && !html) {
      console.log(`[SEO Crawler] ${path} — FAILED: ${error}`)
      allFindings.push({ type: 'Bug', severity: 'High', issue: `Page failed to load: ${error}`, page: path })
      continue
    }
    const data = extractSEOData(url, html)
    results.push(data)
    allFindings.push(...data.findings)
    console.log(`[SEO Crawler] ${path} — ${data.findings.length} issues`)
    await new Promise(r => setTimeout(r, 600)) // polite crawl delay
  }

  console.log(`[SEO Crawler] ✅ Complete — ${results.length} pages audited, ${allFindings.length} total findings`)
  return {
    ok: true, company,
    pagesAudited: results.length,
    totalFindings: allFindings.length,
    findings: allFindings,
    pages: results
  }
}

export async function runSEOCrawlAndLodgeTasks(company = 'GRI') {
  const crawl = await runSEOCrawl(company)
  if (!crawl.ok) return crawl

  const HIGH = crawl.findings.filter(f => f.severity === 'High')
  const MED  = crawl.findings.filter(f => f.severity === 'Medium')

  const tasksCreated = []
  const priorityFindings = [...HIGH, ...MED].slice(0, 10)

  for (const finding of priorityFindings) {
    try {
      const task = await createTask({
        company,
        title: finding.issue.slice(0, 60),
        taskType: 'SEO',
        owner: 'shopify-dev',
        executor: 'Automated',
        priority: finding.severity === 'High' ? 'High' : 'Medium',
        executionStage: 'Backlog',
        source: 'seo-agent',
        description: `SEO Audit Finding\n\nPage: ${finding.page}\nIssue: ${finding.issue}\nSeverity: ${finding.severity}\n\nExpected outcome: Fix implemented and staged for approval.\nAcceptance criteria: Issue resolved, no regression on surrounding elements.`,
      })
      tasksCreated.push({ finding: finding.issue, page: finding.page })
    } catch(e) {
      console.error('[SEO Crawler] Task creation failed:', e.message)
    }
  }

  return {
    ok: true, company,
    pagesAudited: crawl.pagesAudited,
    totalFindings: crawl.totalFindings,
    tasksCreated: tasksCreated.length,
    tasks: tasksCreated
  }
}
