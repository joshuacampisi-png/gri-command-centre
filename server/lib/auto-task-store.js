/**
 * AUTO TASK STORE
 * ─────────────────────────────────────────────────────────────
 * RULES (enforced permanently):
 *   1. Automated tasks NEVER go to Notion. Dashboard only.
 *   2. A fingerprint is stored the moment a task is seen.
 *      Same issue + page = NEVER created again. Ever.
 *   3. Every task must pass QA before being stored.
 *   4. Tasks are executable on arrival — no vague briefs.
 *   5. Page must actually exist in Shopify before task is
 *      created. Unfixable pages = fingerprinted + dropped.
 * ─────────────────────────────────────────────────────────────
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

const DATA_DIR         = join(process.cwd(), 'data')
const TASKS_FILE       = join(DATA_DIR, 'auto-tasks.json')
const FINGERPRINT_FILE = join(DATA_DIR, 'seo-task-fingerprints.json')

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

// ── Shopify page existence pre-flight ─────────────────────────
// Checks Shopify Admin API before any task is created.
// A page that doesn't exist = task can never be executed.
// Drop it immediately, fingerprint it, never retry.

async function shopifyGet(path) {
  try {
    const { env } = await import('./env.js')
    const domain = env.shopify?.storeDomain || process.env.SHOPIFY_STORE_DOMAIN || ''
    const token  = env.shopify?.adminAccessToken || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || ''
    if (!domain || !token) return null
    const r = await fetch(`https://${domain}/admin/api/2024-10${path}`, {
      headers: { 'X-Shopify-Access-Token': token },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return null
    return r.json()
  } catch { return null }
}

export async function pageExistsInShopify(pagePath) {
  try {
    const segments = pagePath.replace(/^\/+/, '').split('/')
    const type   = segments[0]
    const handle = segments[1]

    if (!handle || !type) return true // root paths — always valid

    if (type === 'pages') {
      for (const h of [handle, handle + 's', handle + '-us']) {
        const d = await shopifyGet(`/pages.json?handle=${encodeURIComponent(h)}&limit=1`)
        if (d && (d.pages || []).length > 0) return true
      }
      return false // page genuinely missing
    }

    if (type === 'collections') {
      if (handle === 'all') return true
      const d1 = await shopifyGet(`/custom_collections.json?handle=${encodeURIComponent(handle)}&limit=1`)
      if (d1 && (d1.custom_collections || []).length > 0) return true
      const d2 = await shopifyGet(`/smart_collections.json?handle=${encodeURIComponent(handle)}&limit=1`)
      if (d2 && (d2.smart_collections || []).length > 0) return true
      return false
    }

    return true // blogs, policies, root — assume valid
  } catch {
    return true // network error → don't block task creation
  }
}

// ── Normalisation ─────────────────────────────────────────────

function norm(str = '') {
  return str
    .replace(/[\u2013\u2014\u2015\u2212\u2010]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function makeFingerprint(issue = '', page = '') {
  const shortIssue = issue.length > 60 ? issue.slice(0, 60) : issue
  return norm(`${shortIssue}||${page}`)
}

// ── Fingerprint store (permanent memory) ─────────────────────

export function loadFingerprints() {
  try { return new Set(JSON.parse(readFileSync(FINGERPRINT_FILE, 'utf8'))) }
  catch { return new Set() }
}

export function saveFingerprints(set) {
  try { writeFileSync(FINGERPRINT_FILE, JSON.stringify([...set], null, 2)) }
  catch (e) { console.error('[AutoTaskStore] Fingerprint save failed:', e.message) }
}

export function hasBeenSeen(issue, page) {
  return loadFingerprints().has(makeFingerprint(issue, page))
}

export function markAsSeen(issue, page) {
  const fps = loadFingerprints()
  fps.add(makeFingerprint(issue, page))
  saveFingerprints(fps)
}

// ── Task store CRUD ───────────────────────────────────────────

export function loadTasks() {
  try {
    if (!existsSync(TASKS_FILE)) return []
    return JSON.parse(readFileSync(TASKS_FILE, 'utf8'))
  } catch { return [] }
}

function saveTasks(tasks) {
  writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2))
}

export function addTask(task) {
  const tasks = loadTasks()
  tasks.unshift(task)
  saveTasks(tasks)
  return task
}

export function updateTaskStatus(id, updates) {
  const tasks = loadTasks()
  const idx = tasks.findIndex(t => t.id === id)
  if (idx === -1) return null
  if (typeof updates === 'string') {
    tasks[idx].status = updates
  } else {
    Object.assign(tasks[idx], updates)
  }
  tasks[idx].updatedAt = new Date().toISOString()
  saveTasks(tasks)
  return tasks[idx]
}

export function getTask(id) {
  return loadTasks().find(t => t.id === id) || null
}

// ── QA GATE ───────────────────────────────────────────────────

export function qaTask(task) {
  const reasons = []

  if (!task.title || task.title.length < 15)
    reasons.push('Title too short — not specific enough to act on')

  if (!task.page || !task.page.startsWith('/'))
    reasons.push('Missing valid page path')

  if (!task.description || task.description.length < 100)
    reasons.push('Description too short — must include WHAT, WHY, and ACCEPTANCE CRITERIA')

  if (!/acceptance criteria/i.test(task.description || ''))
    reasons.push('Missing ACCEPTANCE CRITERIA — executor cannot know when the task is done')

  if (!task.previewUrl)
    reasons.push('Missing preview URL — executor needs to see the live page')

  const vague = ['improve', 'fix issue', 'update page', 'check', 'review', 'look at']
  const tl = (task.title || '').toLowerCase()
  for (const v of vague) {
    if (tl === v || tl.startsWith(v + ' ')) {
      reasons.push(`Vague title: "${task.title}" — state exactly what to add/remove/change`)
      break
    }
  }

  return { pass: reasons.length === 0, reasons }
}

// ── Create a new auto task (full pipeline) ───────────────────
// async — checks Shopify page existence before QA.
// Returns { task, qa } on success, null on skip/fail.

export async function createAutoTask({
  issue,
  page,
  severity,
  priority,
  company,
  title,
  description,
  previewUrl,
  brief,
  effort = 'Low',
  source = 'seo-flywheel',
}) {
  // 1. Permanent dedup — seen before = skip forever
  if (hasBeenSeen(issue, page)) {
    console.log(`[AutoTaskStore] SKIP (permanent memory): ${issue} on ${page}`)
    return null
  }

  // 2. Page existence check — if page missing in Shopify,
  //    task is unexecutable. Fingerprint + drop. Never retry.
  const exists = await pageExistsInShopify(page)
  if (!exists) {
    console.warn(`[AutoTaskStore] PAGE NOT FOUND: ${page} — dropped and fingerprinted forever`)
    markAsSeen(issue, page)
    return null
  }

  const task = {
    id:        `auto-${randomUUID()}`,
    title:     title.slice(0, 100),
    issue,
    page,
    severity,
    priority,
    company,
    description,
    previewUrl,
    brief,
    effort,
    source,
    taskType:  'SEO',
    executor:  'Automated',
    status:    'Backlog',
    origin:    'auto',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  // 3. QA gate — every task must be fully executable
  const qa = qaTask(task)
  if (!qa.pass) {
    console.warn(`[AutoTaskStore] QA FAILED: ${issue} on ${page}`)
    for (const r of qa.reasons) console.warn(`  ✗ ${r}`)
    markAsSeen(issue, page)
    return null
  }

  // 4. Store + fingerprint
  addTask(task)
  markAsSeen(issue, page)

  console.log(`[AutoTaskStore] ✅ New task stored: ${title.slice(0, 60)}`)
  return { task, qa }
}
