import { sendTelegramMessage } from '../connectors/telegram.js'
import { updateTaskState } from '../connectors/notion.js'
import { env } from './env.js'

const pendingApprovals = new Map() // taskId -> task data

/**
 * Approval Queue System
 * - New tasks from flywheel → sent to Josh on Telegram
 * - Interactive approve/reject buttons
 * - Approved tasks → executor picks them up
 */

export async function requestApproval(task, context) {
  const taskId = task.id
  const title = task.title || 'Untitled Task'
  const company = task.company || 'GRI'
  const priority = task.priority || 'Medium'
  const description = task.description || 'No description'
  
  // Store in pending queue
  pendingApprovals.set(taskId, {
    task,
    context,
    requestedAt: new Date().toISOString()
  })

  // Send to Josh on Telegram
  const message = `🚨 **NEW TASK DETECTED**

📋 **${title}**

🏢 Company: ${company}
⚡ Priority: ${priority}
🔧 Type: ${task.taskType || 'Unknown'}

📝 Description:
${description}

🤖 Auto-detected by: ${context.source || 'Flywheel'}

---
**ACTION REQUIRED:**

Reply with:
\`/approve ${taskId}\` to execute immediately
\`/reject ${taskId}\` to archive
\`/defer ${taskId}\` to move to manual backlog`

  try {
    await sendTelegramMessage(env.telegram.joshChatId, message)
    console.log(`[Approval] Sent approval request to Telegram: ${title}`)
  } catch (error) {
    console.error(`[Approval] Failed to send Telegram message:`, error.message)
  }

  return { ok: true, taskId, status: 'pending-approval' }
}

export async function handleApproval(taskId, action, userId) {
  const approval = pendingApprovals.get(taskId)
  
  if (!approval) {
    return { ok: false, error: 'Task not found in approval queue' }
  }

  const { task } = approval
  const title = task.title || 'Untitled'

  try {
    if (action === 'approve') {
      // Update task to Approval status (executor will pick it up)
      await updateTaskState(taskId, {
        status: 'Approval',
        executionLog: `✅ Approved by Josh at ${new Date().toISOString()}\n\nQueued for auto-execution.`
      })

      await sendTelegramMessage(env.telegram.joshChatId, `✅ **APPROVED**\n\n${title}\n\nTask queued for execution. You'll get a notification when it's live.`)
      
      pendingApprovals.delete(taskId)
      console.log(`[Approval] Task approved: ${title}`)
      
      return { ok: true, action: 'approved', taskId }
      
    } else if (action === 'reject') {
      // Move to Rejected
      await updateTaskState(taskId, {
        status: 'Rejected',
        executionLog: `❌ Rejected by Josh at ${new Date().toISOString()}`
      })

      await sendTelegramMessage(env.telegram.joshChatId, `❌ **REJECTED**\n\n${title}\n\nTask archived.`)
      
      pendingApprovals.delete(taskId)
      console.log(`[Approval] Task rejected: ${title}`)
      
      return { ok: true, action: 'rejected', taskId }
      
    } else if (action === 'defer') {
      // Keep in Backlog, remove from auto-queue
      await updateTaskState(taskId, {
        status: 'Backlog',
        executionLog: `⏸️ Deferred by Josh at ${new Date().toISOString()}\n\nMoved to manual backlog.`
      })

      await sendTelegramMessage(env.telegram.joshChatId, `⏸️ **DEFERRED**\n\n${title}\n\nTask moved to manual backlog.`)
      
      pendingApprovals.delete(taskId)
      console.log(`[Approval] Task deferred: ${title}`)
      
      return { ok: true, action: 'deferred', taskId }
    }
  } catch (error) {
    console.error(`[Approval] Action failed for ${taskId}:`, error.message)
    return { ok: false, error: error.message }
  }

  return { ok: false, error: 'Invalid action' }
}

export function getPendingApprovals() {
  return Array.from(pendingApprovals.entries()).map(([taskId, data]) => ({
    taskId,
    title: data.task.title,
    requestedAt: data.requestedAt
  }))
}

export async function notifyTaskExecuted(task, result) {
  const title = task.title || 'Untitled'
  const message = `✅ **TASK EXECUTED**

📋 ${title}

🚀 Changes pushed live:
${result.summary}

Details:
${result.details}

View in Notion: ${task.notionUrl || 'N/A'}`

  try {
    await sendTelegramMessage(env.telegram.joshChatId, message)
    console.log(`[Approval] Notified Josh of execution: ${title}`)
  } catch (error) {
    console.error(`[Approval] Failed to send execution notification:`, error.message)
  }
}
