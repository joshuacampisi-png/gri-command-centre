/**
 * Notion Task Completion Poller
 * Runs every 2 minutes — watches for tasks that flip to Done/Complete
 * and fires a Slack DM + channel alert to Josh
 */

import { getNotionSnapshot } from '../connectors/notion.js'
import { notifyTaskCompleted } from '../connectors/slack.js'

const DONE_STATUSES = new Set(['Done', 'Complete', 'Completed', 'Delivered', 'Shipped', 'Live'])
const POLL_INTERVAL = 2 * 60 * 1000 // 2 minutes

// In-memory tracking — resets on server restart, which is fine
const notifiedIds  = new Set()
const knownStatuses = new Map() // taskId → last known status

let pollTimer = null

async function poll() {
  try {
    const snapshot = await getNotionSnapshot('All')
    const tasks = snapshot.tasks || []

    for (const task of tasks) {
      const prev = knownStatuses.get(task.id)
      const curr = task.status

      // Track status
      knownStatuses.set(task.id, curr)

      // Skip if already notified
      if (notifiedIds.has(task.id)) continue

      // Skip if not done
      if (!curr || !DONE_STATUSES.has(curr)) continue

      // Skip if it was already done last time we checked (no transition)
      if (prev && DONE_STATUSES.has(prev)) continue

      // New completion detected — notify
      console.log(`[Poller] Task completed: ${task.title}`)
      notifiedIds.add(task.id)

      await notifyTaskCompleted(task).catch(err =>
        console.error('[Poller] Slack notify failed:', err.message)
      )
    }
  } catch (err) {
    console.error('[Poller] Poll error:', err.message)
  }
}

export function startNotionPoller() {
  console.log('[Poller] Starting Notion task completion poller (every 2 min)')
  // First poll after 10s to let server fully boot
  setTimeout(() => {
    poll()
    pollTimer = setInterval(poll, POLL_INTERVAL)
  }, 10_000)
}

export function stopNotionPoller() {
  if (pollTimer) clearInterval(pollTimer)
}

// Manual trigger endpoint
export async function triggerPoll() {
  await poll()
  return { ok: true, tracked: knownStatuses.size, notified: notifiedIds.size }
}
