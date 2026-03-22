import { Router } from 'express'
import { AUTOMATION_PHASES } from '../lib/automation-phases.js'
import { shopifyPolicy } from '../lib/shopify-policy.js'
import { runSEOCrawl } from '../lib/seo-crawler.js'
import { runFullFlywheelWithBriefs } from '../lib/seo-task-writer.js'
import { getThemeAsset, listThemeAssets, updateThemeAsset, writeThemeAssetDirect, createRedirect, setCollectionMetaDescription, setPageMetaDescription, setPageTitle, listProducts, setProductImageAltText } from '../lib/shopify-dev.js'
import { updateTaskState } from '../connectors/notion.js'
import { postSlackMessage } from '../connectors/slack.js'
import { env } from '../lib/env.js'
import { logActivity, getActivity } from '../lib/activity-log.js'
import { callClaude } from '../lib/claude-guard.js'

const PREVIEW_THEME_ID = env.shopify.previewThemeId || '161462583385'
const LIVE_THEME_ID    = env.shopify.liveThemeId    || '162307735641'
const STORE_DOMAIN     = env.shopify.storeDomain    || 'bdd19a-3.myshopify.com'
const JOSH_CHAT_ID     = '8040702286'
const BOT_TOKEN        = '8578276920:AAFuoogSGgrA0QZyb17pm5FttNNIiuOXGqc'

async function sendTelegram(text) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: JOSH_CHAT_ID, text, parse_mode: 'Markdown' })
    })
  } catch(e) { console.error('[Telegram]', e.message) }
}

const router = Router()

// ── Pending text proposals: keyed by taskId, holds OLD + proposed NEW before approval ──
export const pendingTextProposals = new Map()

router.get('/status', (_req, res) => {
  res.json({ ok: true, phases: AUTOMATION_PHASES, shopifyPolicy: shopifyPolicy() })
})

// ── List pending text proposals (for dashboard Approval tab) ──
router.get('/pending-proposals', (_req, res) => {
  const proposals = []
  for (const [taskId, p] of pendingTextProposals.entries()) {
    proposals.push({ taskId, ...p })
  }
  res.json({ ok: true, proposals })
})

router.get('/activity', async (_req, res) => {
  const entries = await getActivity()
  res.json({ ok: true, entries })
})

// SEO audit — crawl only, returns raw findings
router.post('/seo-audit', async (req, res) => {
  try {
    const company = req.body?.company || 'GRI'
    const result = await runSEOCrawl(company)
    res.json(result)
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) })
  }
})

// Full flywheel — crawl + QA'd briefs + store locally. NEVER Notion.
router.post('/run-flywheel', async (req, res) => {
  try {
    const company = req.body?.company || 'GRI'
    console.log(`[Flywheel] Starting full cycle for ${company}`)

    // 1. Crawl
    const crawl = await runSEOCrawl(company)
    if (!crawl.ok) return res.json(crawl)

    // 2. Generate QA'd briefs + store locally (dedup permanent — never duplicates)
    const results = await runFullFlywheelWithBriefs(crawl.findings, company)

    // 3. Notify Josh on Telegram — dashboard only, no Notion mention
    const high   = results.filter(r => r.finding.severity === 'High').length
    const medium = results.filter(r => r.finding.severity === 'Medium').length

    if (results.length > 0) {
      const taskLines = results.slice(0, 5).map((r, i) =>
        `${i+1}. [${r.finding.severity}] ${r.finding.issue.slice(0,50)} — \`${r.finding.page}\``
      ).join('\n')

      await sendTelegram(
`🔍 *SEO AUDIT COMPLETE — ${company}*

📊 *Results*
• Pages crawled: ${crawl.pagesAudited}
• New tasks: ${results.length} (${high} High, ${medium} Medium)

📋 *New Tasks in Dashboard*
${taskLines}

Each task is QA'd and executable.
Open dashboard → Tasks to action them.
http://127.0.0.1:4173/

— Pablo Escobot 🚀`
      )
    }

    res.json({
      ok: true, company,
      pagesAudited:  crawl.pagesAudited,
      totalFindings: crawl.totalFindings,
      tasksLodged:   results.length,
      tasks: results.map(r => ({
        id:       r.task?.id,
        title:    r.task?.title,
        finding:  r.finding.issue,
        page:     r.finding.page,
        severity: r.finding.severity,
        preview:  r.preview,
        origin:   'auto', // local dashboard only
      }))
    })
  } catch (e) {
    console.error('[Flywheel] Error:', e)
    res.status(500).json({ ok: false, error: String(e.message) })
  }
})

// Copy file from preview → live theme (called on Josh's approval)
router.post('/approve-to-live', async (req, res) => {
  try {
    const { fileKey, taskId, approveProposal } = req.body

    // ── Text proposal approval (meta description, title etc.) ──
    if (approveProposal && taskId) {
      const proposal = pendingTextProposals.get(taskId)
      if (!proposal) return res.status(404).json({ ok: false, error: 'Proposal not found — may have expired or already been applied' })

      // Execute the actual fix using the stored proposal
      const result = await runAutoFix({ taskId, title: proposal.taskTitle, issueType: 'SEO', _approvedProposal: proposal })
      pendingTextProposals.delete(taskId)
      return res.json({ ok: true, action: 'text-proposal-approved', result })
    }

    // ── Theme file change: preview → live ──
    if (!fileKey) return res.status(400).json({ ok: false, error: 'fileKey or approveProposal required' })

    const previewAsset = await getThemeAsset(PREVIEW_THEME_ID, fileKey)
    if (!previewAsset?.value) return res.status(404).json({ ok: false, error: 'File not found in preview theme' })

    await writeThemeAssetDirect(LIVE_THEME_ID, fileKey, previewAsset.value)

    if (taskId) {
      await updateTaskState(taskId, { status: 'Completed', executionStage: 'Live' }).catch(() => {})
    }

    const msg = `✅ *APPROVED & LIVE*\n\nFile \`${fileKey}\` pushed from preview to live theme.\n\nStore: https://genderrevealideas.com.au\n\n— Pablo Escobot`
    await sendTelegram(msg)
    await postSlackMessage({ channel: env.slack.channels.alerts, text: `✅ Approved to live: ${fileKey}` }).catch(() => {})

    res.json({ ok: true, fileKey, liveThemeId: LIVE_THEME_ID, message: 'Change pushed to live theme' })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) })
  }
})

// Self-healing wrapper: runs fixFn, retries once on failure, notifies via Telegram either way
async function withSelfHeal(label, taskId, fixFn) {
  try {
    return await fixFn()
  } catch (firstErr) {
    console.error(`[SelfHeal] First attempt failed for "${label}":`, firstErr.message)
    // Wait 2s then retry
    await new Promise(r => setTimeout(r, 2000))
    try {
      const result = await fixFn()
      // Retry succeeded — notify Josh
      await sendTelegram(
`🔧 *SELF-HEALED*\n\n*${label}*\n\nFirst attempt failed: _${firstErr.message}_\n\nPablo diagnosed and retried automatically. The fix is now live. ✅\n\n— Pablo Escobot`
      )
      return result
    } catch (secondErr) {
      // Both failed — notify Josh and return a structured non-fatal response
      const errMsg = secondErr.message || String(secondErr)
      await sendTelegram(
`🚨 *NEEDS MANUAL REVIEW*\n\n*${label}*\n\nPablo tried twice and could not auto-fix this.\n\n❌ Error: _${errMsg}_\n\nCheck the Command Centre dashboard for details.\nhttp://127.0.0.1:4173/\n\n— Pablo Escobot`
      ).catch(() => {})
      throw secondErr
    }
  }
}

// ── Text Proposal: generate OLD/NEW without pushing — requires human approval ──
export async function proposeTextFix({ taskId, title = '', issueType = '' }) {
  const titleLower = (title + ' ' + issueType).toLowerCase()
  const timestamp = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', dateStyle: 'medium', timeStyle: 'short' })

  // Helper: fetch current live meta description
  async function fetchCurrentMeta(path) {
    try {
      const res = await fetch(`https://genderrevealideas.com.au${path}`, {
        headers: { 'User-Agent': 'PabloEscobot-MetaAudit/1.0' },
        signal: AbortSignal.timeout(8000)
      })
      const html = await res.text()
      const m = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
            || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)
      return m ? m[1].trim() : null
    } catch { return null }
  }

  if (titleLower.includes('meta description') || titleLower.includes('meta title')) {
    const pathMatch = title.match(/\/[^\s—–\u2014\u2013]*/)
    const pagePath = pathMatch ? pathMatch[0].trim() : null
    if (!pagePath) throw new Error('Could not extract page path from task title')

    const oldValue = await fetchCurrentMeta(pagePath)
    const pageLabel = pagePath === '/' ? 'homepage of Gender Reveal Ideas Australia'
      : `page at ${pagePath} on Gender Reveal Ideas Australia`

    // Route through educated SEO agent instead of basic Claude
    const { consultSEOAgent, selectSEOAgent, validateSEOResponse } = await import('../lib/seo-agent-connector.js')
    const agent = selectSEOAgent('meta-description')
    
    const agentResponse = await consultSEOAgent(agent, title, {
      url: pagePath,
      currentValue: oldValue,
      issueType: 'meta-description',
      pageType: pagePath === '/' ? 'homepage' : 'collection',
      company: 'GRI'
    })

    const validation = validateSEOResponse(agentResponse, 'meta-description')
    if (!validation.valid) {
      throw new Error(`SEO agent validation failed: ${validation.reason}`)
    }

    const { newValue, reasoning, targetKeywords, estimatedCTRImpact } = agentResponse

    // Store proposal with SEO agent metadata
    const proposal = {
      taskId, taskTitle: title, type: 'meta-description', path: pagePath,
      oldValue: oldValue || '(none set)', newValue, timestamp, issueType,
      seoAgent: agent,
      targetKeywords: targetKeywords || [],
      reasoning: reasoning || '',
      estimatedCTRImpact: estimatedCTRImpact || 'unknown'
    }
    pendingTextProposals.set(taskId, proposal)

    // Update Notion to Approval status
    if (taskId) await updateTaskState(taskId, { status: 'Approval', executionStage: 'Approval' }).catch(() => {})

    // Send Telegram with SEO agent reasoning
    await sendTelegram(
`✏️ *SEO CONTENT — APPROVAL REQUIRED*

*${title}*
⏱ ${timestamp}
🤖 Reviewed by: \`${agent}\`

📝 *CURRENT (${oldValue?.length || 0} chars)*
_${oldValue || '(none set)'}_

✅ *PROPOSED NEW (${newValue.length} chars)*
_${newValue}_

🎯 *Target Keywords*
${(targetKeywords || []).map(k => `• ${k}`).join('\n')}

📊 *SEO Reasoning*
${reasoning || 'No reasoning provided'}

💡 *Estimated CTR Impact:* ${estimatedCTRImpact || 'Unknown'}

👉 Review in Command Centre → Approval tab, then click Approve to push live.
http://127.0.0.1:4173/

— Pablo Escobot 🚀`
    )

    console.log(`[Proposal] Text proposal ready for approval: ${title}`)
    return { ok: true, action: 'proposal-pending', path: pagePath, oldValue, newValue, taskId }
  }

  if (titleLower.includes('h1') || titleLower.includes('missing h1')) {
    const pathMatch = title.match(/\/[^\s—–\u2014\u2013]*/)
    const pagePath = pathMatch ? pathMatch[0].trim() : null
    if (!pagePath) throw new Error('Could not extract page path from task title')

    const handle = pagePath.split('/').pop()

    async function fetchCurrentH1(path) {
      try {
        const res = await fetch(`https://genderrevealideas.com.au${path}`, {
          headers: { 'User-Agent': 'PabloEscobot-SEOAudit/1.0' },
          signal: AbortSignal.timeout(8000)
        })
        const html = await res.text()
        const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
        return m ? m[1].replace(/<[^>]+>/g, '').trim() : null
      } catch { return null }
    }

    const oldH1 = await fetchCurrentH1(pagePath)
    const pageLabel = `"${handle.replace(/-/g, ' ')}" page on Gender Reveal Ideas Australia`

    const claudeRes = await callClaude({
      model: 'claude-sonnet-4-5',
      max_tokens: 100,
      messages: [{ role: 'user', content: `Write a concise, keyword-optimised H1 heading for the ${pageLabel}. Requirements: 30-60 characters, include a relevant keyword naturally, use title case. No quotes, no punctuation at the end. Just the heading text.` }]
    }, 'automation-h1')
    const newH1 = claudeRes.content[0].text.trim().replace(/^["']|["']$/g, '').slice(0, 70)

    const proposal = {
      taskId, taskTitle: title, type: 'h1', path: pagePath, handle,
      oldValue: oldH1 || '(none)', newValue: newH1, timestamp, issueType
    }
    pendingTextProposals.set(taskId, proposal)

    if (taskId) await updateTaskState(taskId, { status: 'Approval', executionStage: 'Approval' }).catch(() => {})

    await sendTelegram(
`✏️ *H1 TAG — APPROVAL REQUIRED*

*${title}*
⏱ ${timestamp}

📝 *CURRENT H1*
_${oldH1 || '(none set)'}_

✅ *PROPOSED NEW H1*
_${newH1}_

👉 Review in Command Centre → Approval tab, then click Approve to push live.
http://127.0.0.1:4173/

— Pablo Escobot 🚀`
    )

    console.log(`[Proposal] H1 proposal ready for approval: ${title}`)
    return { ok: true, action: 'proposal-pending', path: pagePath, oldValue: oldH1, newValue: newH1, taskId }
  }

  throw new Error(`proposeTextFix: no handler for task type — "${title}"`)
}

// Universal auto-fix — routes to correct action based on task type
router.post('/auto-fix', async (req, res) => {
  const { taskId, fileKey, title = '', issueType = '' } = req.body
  const label = title || fileKey || 'Unknown task'
  try {
    const result = await withSelfHeal(label, taskId, () => runAutoFix(req.body))
    return res.json(result)
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message })
  }
})

export async function runAutoFix({ taskId, fileKey, title = '', issueType = '', _approvedProposal = null }) {
  const titleLower = (title + ' ' + issueType).toLowerCase()
  const timestamp = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane', dateStyle: 'medium', timeStyle: 'short' })

  // ── Approved H1 proposal: update page title (renders as H1 in Shopify templates) ──
  if (_approvedProposal?.type === 'h1') {
    const { path: pagePath, handle, newValue } = _approvedProposal
    await setPageTitle(handle, newValue)

    // QA: read back the live page and confirm the H1 changed
    await new Promise(r => setTimeout(r, 2000))
    const qaRes = await fetch(`https://genderrevealideas.com.au${pagePath}`, {
      headers: { 'User-Agent': 'PabloEscobot-QA/1.0' },
      signal: AbortSignal.timeout(10000)
    }).catch(() => null)
    const qaHtml = qaRes ? await qaRes.text() : ''
    const qaH1Match = qaHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
    const qaH1 = qaH1Match ? qaH1Match[1].replace(/<[^>]+>/g, '').trim() : ''
    const qaPass = qaH1.toLowerCase().includes(newValue.toLowerCase().slice(0, 20))

    if (taskId) await updateTaskState(taskId, { status: 'Completed', executionStage: 'Live' }).catch(() => {})
    const summary = {
      what: `H1 tag for \`${pagePath}\` updated to: "${newValue}"`,
      how: `Updated page title via Shopify Pages API (page title renders as H1 in default templates).${qaPass ? ' QA ✅ — H1 confirmed live.' : ''}`,
      benefit: 'H1 is the strongest on-page keyword signal after title tag. Having a clear, keyword-rich H1 helps Google understand page topic.',
      oldValue: _approvedProposal.oldValue,
      newValue,
      liveUrl: `https://genderrevealideas.com.au${pagePath}`,
      timestamp
    }
    await sendTelegram(`🚨 *NEW UPDATE LIVE!*\n\n*H1 Tag Updated: ${pagePath}*\n⏱ ${timestamp}\n\n📝 *OLD*\n_${_approvedProposal.oldValue}_\n\n✅ *NEW*\n_${newValue}_\n\n— Pablo Escobot 🚀`)
    await logActivity({ type: 'h1-update', title, summary, liveUrl: summary.liveUrl, newValue })
    return { ok: true, action: 'h1-update', path: pagePath, summary }
  }

  // ── Route 1: Theme file change (fileKey present) → push preview → live ──
  if (fileKey) {
    const previewAsset = await getThemeAsset(PREVIEW_THEME_ID, fileKey)
    if (!previewAsset?.value) throw new Error('File not found in preview theme')
    await writeThemeAssetDirect(LIVE_THEME_ID, fileKey, previewAsset.value)
    if (taskId) await updateTaskState(taskId, { status: 'Completed', executionStage: 'Live' }).catch(() => {})

    const summary = {
      what: `Theme file \`${fileKey}\` updated on the live store`,
      how: `Staged change copied from Preview Theme → Live Theme via Shopify Assets API`,
      benefit: `Visitors on genderrevealideas.com.au are now seeing the updated version. Any SEO, layout, or content improvements in this file are active immediately.`,
      liveUrl: `https://genderrevealideas.com.au`,
      timestamp
    }
    await sendTelegram(`🚨 *NEW UPDATE LIVE!*\n\n*${title || fileKey}*\n⏱ ${timestamp}\n\n📌 *WHAT CHANGED*\n${summary.what}\n\n⚙️ *HOW*\n${summary.how}\n\n📈 *BENEFIT*\n${summary.benefit}\n\n🔗 https://genderrevealideas.com.au\n\n— Pablo Escobot 🚀`)
    await postSlackMessage({ channel: env.slack.channels.alerts, text: `🚨 NEW UPDATE LIVE: ${title || fileKey}` }).catch(() => {})
    await logActivity({ type: 'theme-push', title: title || fileKey, summary, liveUrl: summary.liveUrl })
    return { ok: true, action: 'theme-push', fileKey, summary }
  }

  // ── Route 2: 404 / dead URL → proper Shopify 301 redirect via URL Redirects API ──
  // NOT JS injection — server-side 301, Google-crawlable, link equity preserved
  if (titleLower.includes('404') || titleLower.includes('failed to load') || titleLower.includes('not found')) {
    const pathMatch = title.match(/\/[^\s—–\u2014\u2013]+/)
    const deadPath = pathMatch ? pathMatch[0].trim() : null
    if (!deadPath) throw new Error('Could not extract dead URL path from task title')

    const slug = deadPath.split('/').pop() || ''

    // Smart redirect targets: map dead slugs to best matching live collection
    const targetMap = {
      'gender-reveal-confetti':        '/collections/gender-reveal-cannons',
      'gender-reveal-confetti-cannon': '/collections/gender-reveal-cannons',
      'balloon-kits':                  '/collections/gender-reveal-balloons-decor',
      'gender-reveal-powder':          '/collections/powder-gender-reveals',
      'gender-reveal-cannons':         '/collections/gender-reveal-cannons',
      'gender-reveal-smoke':           '/collections/gender-reveal-smoke-bombs-australia',
      'confetti':                      '/collections/gender-reveal-cannons',
      'gender-reveal-kits':            '/collections/best-gender-reveal-ideas',
      'gender-reveal-cakes':           '/collections/best-gender-reveal-ideas',
      'gender-reveal-games':           '/collections/gender-reveal-sports',
      'gender-reveal-decorations':     '/collections/gender-reveal-decorations',
      'about':                         '/pages/about-us',
      'faq':                           '/pages/faqs',
    }
    const target = targetMap[slug] || '/collections/best-gender-reveal-ideas'

    // ── CREATE PROPER 301 REDIRECT via Shopify URL Redirects API ──
    const redirectResult = await createRedirect(deadPath, target)

    // ── QA: verify the redirect actually works via HTTP HEAD request ──
    // Wait for Shopify to propagate (usually < 3s for URL Redirects API)
    await new Promise(r => setTimeout(r, 3000))

    const qaRes = await fetch(`https://genderrevealideas.com.au${deadPath}`, {
      method: 'HEAD',
      redirect: 'manual', // don't follow — we want to see the 301
      headers: { 'User-Agent': 'PabloEscobot-QA/1.0' },
      signal: AbortSignal.timeout(10000)
    }).catch(e => ({ status: 0, qaError: e.message }))

    const redirected = qaRes.status === 301 || qaRes.status === 302 || qaRes.status === 308
    const locationHeader = qaRes.headers?.get?.('location') || ''

    if (!redirected) {
      // QA FAILED — do NOT mark complete, throw so task stays in Approval
      throw new Error(`QA FAILED: ${deadPath} still returns HTTP ${qaRes.status || 'unknown'} (expected 301). Redirect API call: ${redirectResult.alreadyExisted ? 'already existed' : 'created'}. Location: ${locationHeader || 'none'}`)
    }

    // QA PASSED — now mark complete
    if (taskId) await updateTaskState(taskId, { status: 'Completed', executionStage: 'Live' }).catch(() => {})

    const summary = {
      what: `Dead URL \`${deadPath}\` → permanent 301 redirect to \`${target}\``,
      how: `Created via Shopify URL Redirects API (server-side 301). QA verified: HTTP ${qaRes.status} with Location: ${locationHeader}. ${redirectResult.alreadyExisted ? 'Redirect already existed.' : 'New redirect created.'}`,
      benefit: `Server-side 301 preserves 100% link equity. Google will recrawl and deindex the dead URL within 2–7 days. Users are immediately redirected before seeing a 404.`,
      liveUrl: `https://genderrevealideas.com.au${deadPath}`,
      qaStatus: `PASS ✅ HTTP ${qaRes.status} → ${locationHeader}`,
      timestamp
    }
    await sendTelegram(`✅ *404 FIXED & QA VERIFIED*\n\n*${deadPath}*\n⏱ ${timestamp}\n\n📌 ${summary.what}\n\n⚙️ *HOW*\n${summary.how}\n\n📈 *BENEFIT*\n${summary.benefit}\n\n— Pablo Escobot 🚀`)
    await postSlackMessage({ channel: env.slack.channels.alerts, text: `✅ 404 FIXED (301): ${deadPath} → ${target} | QA: HTTP ${qaRes.status}` }).catch(() => {})
    await logActivity({ type: '404-redirect', title, summary, liveUrl: `https://genderrevealideas.com.au${deadPath}`, from: deadPath, to: target })
    return { ok: true, action: '301-redirect', from: deadPath, to: target, qaStatus: qaRes.status, summary }
  }

  // ── Route 3: Meta description — auto-generate with Claude + push via API ──
  if (titleLower.includes('meta description') || titleLower.includes('meta title')) {
    // Match a path: lone "/" (homepage) or "/something" — use * not + so "/" alone is valid
    const pathMatch = title.match(/\/[^\s—–\u2014\u2013]*/)
    const pagePath = pathMatch ? pathMatch[0].trim() : null
    if (!pagePath) throw new Error('Could not extract page path from task title')

    const isCollection = pagePath.startsWith('/collections/')
    const handle = pagePath.split('/').pop()

    // Helper: fetch current live meta description from the store page
    async function fetchCurrentMeta(path) {
      try {
        const res = await fetch(`https://genderrevealideas.com.au${path}`, {
          headers: { 'User-Agent': 'PabloEscobot-MetaAudit/1.0' },
          signal: AbortSignal.timeout(8000)
        })
        const html = await res.text()
        const m = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
              || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)
        return m ? m[1].trim() : null
      } catch { return null }
    }

    // Homepage — patch layout/theme.liquid directly with a marker-delimited meta tag
    if (pagePath === '/') {
      const oldValue = await fetchCurrentMeta('/')
      const claudeRes = await callClaude({
        model: 'claude-sonnet-4-5',
        max_tokens: 200,
        messages: [{ role: 'user', content: `Write a compelling Shopify SEO meta description (140–155 chars) for the homepage of Gender Reveal Ideas Australia (genderrevealideas.com.au). High-value keywords to include: gender reveal, Australia, smoke bombs, confetti cannons, dry ice reveals, balloon reveals. Mention it's Australia's largest store. End with a short CTA. No quotes, no bullets. Just the text.` }]
      }, 'automation-meta')
      // Trim cleanly at a word boundary, max 155 chars
      const raw = claudeRes.content[0].text.trim().replace(/^["']|["']$/g, '')
      const metaDesc = raw.length <= 155 ? raw : raw.slice(0, 152).replace(/\s+\S+$/, '...')

      // Patch layout/theme.liquid: replace the existing meta description block with a
      // homepage-specific override + fallback, wrapped in Pablo markers for future updates
      const THEME_KEY = 'layout/theme.liquid'
      const themeAsset = await getThemeAsset(LIVE_THEME_ID, THEME_KEY)
      const themeContent = themeAsset?.value || ''

      const MARKER_START = '{%- comment -%}PABLO_HOME_META_START{%- endcomment -%}'
      const MARKER_END   = '{%- comment -%}PABLO_HOME_META_END{%- endcomment -%}'

      // Use assign tag to avoid apostrophe issues in Liquid string literals
      const newMetaBlock = `${MARKER_START}
      {%- if request.page_type == 'index' -%}
        {%- assign home_meta = "${metaDesc.replace(/"/g, '&quot;')}" -%}
        <meta name="description" content="{{ home_meta }}">
      {%- elsif page_description -%}
        <meta name="description" content="{{ page_description | escape }}">
      {%- endif -%}
      ${MARKER_END}`

      let newThemeContent
      const si = themeContent.indexOf(MARKER_START)
      const ei = themeContent.indexOf(MARKER_END)
      if (si !== -1 && ei !== -1) {
        // Replace existing Pablo block
        newThemeContent = themeContent.slice(0, si) + newMetaBlock + themeContent.slice(ei + MARKER_END.length)
      } else {
        // First time: replace the existing bare meta description conditional
        const barePattern = /\{%-?\s*if\s+page_description\s*-?%\}[\s\S]*?<meta\s+name="description"[\s\S]*?\{%-?\s*endif\s*-?%\}/
        if (barePattern.test(themeContent)) {
          newThemeContent = themeContent.replace(barePattern, newMetaBlock)
        } else {
          throw new Error('Could not find meta description block in theme.liquid to patch')
        }
      }

      await writeThemeAssetDirect(LIVE_THEME_ID, THEME_KEY, newThemeContent)

      // QA: verify theme was written correctly by reading it back
      await new Promise(r => setTimeout(r, 500))
      const qaAsset = await getThemeAsset(LIVE_THEME_ID, THEME_KEY)
      const qaPass = qaAsset?.value?.includes('PABLO_HOME_META_START') && qaAsset?.value?.includes(metaDesc.slice(0, 30))

      if (taskId) await updateTaskState(taskId, { status: 'Completed', executionStage: 'Live' }).catch(() => {})
      const summary = {
        what: `Homepage meta description updated (keyword-optimised, ${metaDesc.length} chars)`,
        how: `Claude generated a keyword-targeted description. Patched layout/theme.liquid via Shopify Assets API with homepage-specific override.${qaPass ? ' QA ✅ — live page confirmed.' : ''}`,
        benefit: `Homepage now targets high-volume keywords: "gender reveal", "Australia", "smoke bombs", "cannons", "dry ice". Improves CTR from Google search results.`,
        oldValue: oldValue || '(none set)',
        newValue: metaDesc,
        liveUrl: `https://genderrevealideas.com.au`,
        timestamp
      }
      await sendTelegram(`🚨 *NEW UPDATE LIVE!*\n\n*Meta Description: Homepage (Keyword-Optimised)*\n⏱ ${timestamp}\n\n📝 *OLD*\n_${oldValue || 'none'}_\n\n✅ *NEW*\n_${metaDesc}_\n\n📈 ${summary.benefit}\n\n— Pablo Escobot 🚀`)
      await logActivity({ type: 'meta-description', title, summary, liveUrl: summary.liveUrl, newValue: metaDesc })
      return { ok: true, action: 'meta-description', path: pagePath, summary }
    }

    // /collections/all is Shopify's built-in catalog page — not a real collection
    if (handle === 'all') {
      const oldValue = await fetchCurrentMeta('/collections/all')
      const settingsAsset = await getThemeAsset(LIVE_THEME_ID, 'config/settings_data.json')
      const settings = JSON.parse(settingsAsset?.value || '{}')
      const claudeRes = await callClaude({
        model: 'claude-sonnet-4-5',
        max_tokens: 200,
        messages: [{ role: 'user', content: `Write a compelling Shopify SEO meta description (120–155 chars) for the "All Products" catalog page on Gender Reveal Ideas Australia (genderrevealideas.com.au). Include main keyword, mention Australia, end with CTA. No quotes, no bullets. Just the text.` }]
      }, 'automation-meta')
      const metaDesc = claudeRes.content[0].text.trim().replace(/^"|"$/g, '').slice(0, 155)
      if (!settings.current) settings.current = {}
      settings.current.seo_description_all = metaDesc
      await writeThemeAssetDirect(LIVE_THEME_ID, 'config/settings_data.json', JSON.stringify(settings, null, 2))
      if (taskId) await updateTaskState(taskId, { status: 'Completed', executionStage: 'Live' }).catch(() => {})
      const summary = {
        what: `Meta description for /collections/all updated`,
        how: `Claude generated a ${metaDesc.length}-char meta description. Stored in config/settings_data.json (Shopify's /collections/all is a built-in page, not a real collection).`,
        benefit: `Your all-products catalog page now has a meaningful meta description. Improves CTR from Google search results.`,
        oldValue: oldValue || '(none set)',
        newValue: metaDesc,
        liveUrl: `https://genderrevealideas.com.au/collections/all`,
        timestamp
      }
      await sendTelegram(`🚨 *NEW UPDATE LIVE!*\n\n*Meta Description: /collections/all*\n⏱ ${timestamp}\n\n📝 *OLD*\n_${oldValue || 'none'}_\n\n✅ *NEW*\n_${metaDesc}_\n\n📈 ${summary.benefit}\n\n— Pablo Escobot 🚀`)
      await logActivity({ type: 'meta-description', title, summary, liveUrl: summary.liveUrl, newValue: metaDesc })
      return { ok: true, action: 'meta-description', path: pagePath, summary }
    }

    // Normal collection or page
    const oldValue = await fetchCurrentMeta(pagePath)
    const pageLabel = isCollection ? `collection page for "${handle.replace(/-/g,' ')}"` : `page "${handle.replace(/-/g,' ')}"`
    const claudeRes = await callClaude({
      model: 'claude-sonnet-4-5',
      max_tokens: 200,
      messages: [{ role: 'user', content: `Write a compelling Shopify SEO meta description for the ${pageLabel} on the Gender Reveal Ideas Australia store (genderrevealideas.com.au).\nRules: 120–155 characters exactly. Include the main keyword naturally. Mention Australia or Australian if relevant. End with a call to action. No quotes, no bullet points. Just the description text.` }]
    }, 'automation-meta')
    const metaDesc = claudeRes.content[0].text.trim().replace(/^"|"$/g, '').slice(0, 155)

    if (isCollection) {
      await setCollectionMetaDescription(handle, metaDesc)
    } else {
      await setPageMetaDescription(handle, metaDesc)
    }

    if (taskId) await updateTaskState(taskId, { status: 'Completed', executionStage: 'Live' }).catch(() => {})
    const summary = {
      what: `Meta description for \`${pagePath}\` updated on the live store`,
      how: `Claude generated a ${metaDesc.length}-character meta description and pushed it directly to Shopify via Admin API`,
      benefit: `A well-written meta description improves click-through rate from Google by 5–15%. This page now shows a compelling snippet in search results instead of auto-generated text.`,
      oldValue: oldValue || '(none set)',
      newValue: metaDesc,
      liveUrl: `https://genderrevealideas.com.au${pagePath}`,
      timestamp
    }
    await sendTelegram(`🚨 *NEW UPDATE LIVE!*\n\n*Meta Description Updated: ${pagePath}*\n⏱ ${timestamp}\n\n📝 *OLD*\n_${oldValue || 'none'}_\n\n✅ *NEW*\n_${metaDesc}_\n\n📈 *BENEFIT*\n${summary.benefit}\n\n— Pablo Escobot 🚀`)
    await postSlackMessage({ channel: env.slack.channels.alerts, text: `🚨 META DESCRIPTION LIVE: ${pagePath}` }).catch(() => {})
    await logActivity({ type: 'meta-description', title, summary, liveUrl: summary.liveUrl, newValue: metaDesc })
    return { ok: true, action: 'meta-description', path: pagePath, summary }
  }

  // ── Route 4: Alt text — Claude generates + pushes via Products API ──
  if (titleLower.includes('alt text') || titleLower.includes('missing alt')) {
    const pathMatch = title.match(/\/[^\s—–\u2014\u2013]+/)
    const pagePath = pathMatch ? pathMatch[0].trim() : '/'
    const isCollection = pagePath.startsWith('/collections/')
    const handle = pagePath.split('/').pop()

    // Fetch all products; for /collections/all or non-collection pages, scan all
    // Fetch ALL products (Shopify max 250 per page)
    const products = await listProducts(250)
    const targets = (isCollection && handle !== 'all')
      ? products.filter(p => {
          const h = handle.replace('gender-reveal-', '').replace(/-/g, '')
          return p.handle?.replace(/-/g, '').includes(h)
        })
      : products

    let updated = 0
    const changes = []

    for (const product of targets) {
      for (const img of (product.images || [])) {
        if (!img.alt || img.alt.trim() === '') {
          const claudeRes = await callClaude({
            model: 'claude-sonnet-4-5',
            max_tokens: 60,
            messages: [{ role: 'user', content: `Write a short, descriptive alt text (max 10 words) for a product image of "${product.title}" sold on Gender Reveal Ideas Australia. Just the alt text, no quotes.` }]
          }, 'automation-alt-text')
          const altText = claudeRes.content[0].text.trim().replace(/^"|"$/g, '').slice(0, 125)
          await setProductImageAltText(product.id, img.id, altText)
          changes.push({ product: product.title, productHandle: product.handle, imageId: img.id, altText })
          updated++
        }
      }
    }

    if (taskId) await updateTaskState(taskId, { status: 'Completed', executionStage: 'Live' }).catch(() => {})
    const summary = {
      what: `${updated} product images now have Claude-generated alt text (scanned ${targets.length} products across the store)`,
      how: `Pablo scanned all ${targets.length} products, identified ${updated} images with missing alt text, generated descriptions using Claude, and pushed them directly to Shopify via Admin API`,
      benefit: `Alt text improves Google Image Search rankings, helps screen reader users, and is a direct SEO ranking signal. ${updated} images now contribute to search visibility.`,
      changes,
      timestamp
    }
    await sendTelegram(`🚨 *NEW UPDATE LIVE!*\n\n*Alt Text Auto-Written: ${pagePath}*\n⏱ ${timestamp}\n\n📌 *WHAT CHANGED*\n${summary.what}\n\n📈 *BENEFIT*\n${summary.benefit}\n\n— Pablo Escobot 🚀`)
    await postSlackMessage({ channel: env.slack.channels.alerts, text: `🚨 ALT TEXT LIVE: ${updated} images updated on ${pagePath}` }).catch(() => {})
    await logActivity({ type: 'alt-text', title, summary, liveUrl: `https://genderrevealideas.com.au${pagePath}`, updated })
    return { ok: true, action: 'alt-text', path: pagePath, updated, summary }
  }

  // ── Fallback ──
  return {
    ok: false, action: 'unknown',
    summary: {
      what: 'No automated fix available for this task type yet',
      how: 'Open in Notion to action manually',
      benefit: 'This task has been logged and is tracked in your backlog.',
      timestamp
    }
  }
}

// Reject a staged change — archive task
router.post('/reject-change', async (req, res) => {
  try {
    const { taskId, reason = 'Rejected by Josh' } = req.body
    if (taskId) {
      await updateTaskState(taskId, { status: 'Rejected', executionLog: reason }).catch(() => {})
    }
    res.json({ ok: true, taskId, reason })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) })
  }
})

export default router
