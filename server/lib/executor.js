/**
 * Auto-Executor
 * Every 5 minutes: scans Notion for Backlog SEO tasks that are auto-fixable,
 * calls runAutoFix() for each (the real Shopify + Claude engine), marks them Completed.
 *
 * Auto-fixable = meta descriptions, alt text, 404 redirects (no theme file required)
 * Needs approval = anything with a fileKey (staged theme changes)
 */

import { getNotionSnapshot, updateTaskState } from '../connectors/notion.js'
import { runAutoFix } from '../routes/automation.js'
import { env } from './env.js'

const BOT_TOKEN = '8578276920:AAFuoogSGgrA0QZyb17pm5FttNNIiuOXGqc'
const JOSH_CHAT = '8040702286'

async function sendTelegram(text) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: JOSH_CHAT, text, parse_mode: 'Markdown' })
    })
  } catch (e) { console.error('[Executor] Telegram error:', e.message) }
}

// Text changes → require human approval before pushing live
const TEXT_APPROVAL_PATTERNS = [
  /meta description/i,
  /meta title/i,
  /page title/i,
  /h1/i,
]

// Non-text changes → auto-fix immediately
const AUTO_FIX_PATTERNS = [
  /missing alt text/i,
  /alt text/i,
  /404/i,
  /failed to load/i,
  /HTTP 404/i,
  /broken link/i,
  /dead url/i,
  /title too long/i,
  /title too short/i,
]

function needsApproval(title = '') {
  return TEXT_APPROVAL_PATTERNS.some(p => p.test(title))
}

function isAutoFixable(title = '') {
  return AUTO_FIX_PATTERNS.some(p => p.test(title)) || TEXT_APPROVAL_PATTERNS.some(p => p.test(title))
}

let executorActive = false
let executionStats = { tasksExecuted: 0, tasksFailed: 0, lastScanAt: null }
let processedTaskIds = new Set() // Track already-processed tasks to avoid spam

export function startExecutor() {
  if (executorActive) return
  executorActive = true
  console.log('[Executor] 🚀 Auto-executor activated (simple SEO fixer)')
  
  // Scan every 5 minutes
  setInterval(() => scanAndExecute(), 5 * 60 * 1000)
  
  // Initial scan 20s after boot (after flywheel has lodged initial tasks)
  setTimeout(() => scanAndExecute(), 20000)
}

export function stopExecutor() {
  executorActive = false
  console.log('[Executor] Stopped')
}

export function getExecutorStatus() {
  return { active: executorActive, stats: executionStats }
}

async function scanAndExecute() {
  if (!executorActive) return
  executionStats.lastScanAt = new Date().toISOString()
  console.log('[Executor] Scanning Notion for auto-fixable tasks…')

  try {
    // Load all GRI tasks
    const snapshot = await getNotionSnapshot('GRI')
    const tasks = snapshot.tasks || []

    // Only tasks in Backlog or Approval that are SEO type and auto-fixable
    // SKIP tasks we've already tried to avoid spam
    const candidates = tasks.filter(t =>
      (t.status === 'Backlog' || t.status === 'Approval') &&
      t.taskType === 'SEO' &&
      isAutoFixable(t.title) &&
      !processedTaskIds.has(t.id) // Skip already-processed
    )

    if (candidates.length === 0) {
      console.log('[Executor] No NEW auto-fixable tasks found')
      return
    }

    console.log(`[Executor] Found ${candidates.length} NEW auto-fixable tasks`)
    const fixed = []
    const failed = []

    const pendingApproval = []

    for (const task of candidates) {
      // Mark as processed immediately to avoid retry spam
      processedTaskIds.add(task.id)

      try {
        console.log(`[Executor] Auto-fixing: ${task.title}`)

        // Route ALL auto-fixable tasks through runAutoFix (handles meta, H1, alt text, 404s)
        const result = await runAutoFix({ taskId: task.id, title: task.title, issueType: task.taskType || 'SEO' })

        if (result.ok) {
          console.log(`[Executor] ✅ Fixed: ${task.title} (${result.action})`)
          fixed.push({ title: task.title, action: result.action, summary: result.summary?.what || 'Fixed' })
          executionStats.tasksExecuted++
        } else {
          console.log(`[Executor] → Skipped: ${task.title} — ${result.summary?.what || 'no handler'}`)
        }

      } catch (e) {
        executionStats.tasksFailed++
        failed.push({ title: task.title, error: e.message })
        console.error(`[Executor] ❌ Failed: ${task.title} — ${e.message}`)
      }
    }

    // Telegram summary
    if (fixed.length > 0 || pendingApproval.length > 0) {
      const fixedLines = fixed.map((f, i) => `${i + 1}. ✅ ${f.title?.slice(0, 55)}`).join('\n')
      const approvalLines = pendingApproval.map((p, i) => `${i + 1}. ✏️ ${p.title?.slice(0, 55)}`).join('\n')
      await sendTelegram(
`⚡ *AUTO-EXECUTOR SCAN COMPLETE*

${fixed.length > 0 ? `*AUTO-FIXED (${fixed.length})*\n${fixedLines}\n\n` : ''}${pendingApproval.length > 0 ? `*AWAITING YOUR APPROVAL (${pendingApproval.length})*\n${approvalLines}\n\nReview OLD → NEW and approve in the Command Centre:\nhttp://127.0.0.1:4173/\n\n` : ''}${failed.length > 0 ? `⚠️ ${failed.length} task(s) failed — moved to Approval.\n` : ''}— Pablo Escobot 🚀`
      )
    }
  } catch (e) {
    console.error('[Executor] Scan error:', e.message)
  }
}

export async function executeTaskById(taskId) {
  const snapshot = await getNotionSnapshot('GRI')
  const task = (snapshot.tasks || []).find(t => t.id === taskId)
  if (!task) throw new Error(`Task not found: ${taskId}`)
  const result = await runAutoFix({ taskId: task.id, title: task.title, issueType: task.taskType })
  return result
}
