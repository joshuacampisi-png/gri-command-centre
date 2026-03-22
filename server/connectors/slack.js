import { WebClient } from '@slack/web-api'
import { env } from '../lib/env.js'

const client = env.slack.botToken ? new WebClient(env.slack.botToken) : null

export async function getSlackSnapshot() {
  const connected = Boolean(env.slack.botToken)
  return {
    connected,
    channels: env.slack.channels,
    source: connected ? 'slack-live' : 'mock-fallback'
  }
}

export async function postSlackMessage({ channel, text }) {
  if (!client) return { ok: false, reason: 'Slack not configured' }
  const target = channel || env.slack.channels.command
  if (!target) return { ok: false, reason: 'No Slack channel configured' }
  const result = await client.chat.postMessage({ channel: target, text })
  return { ok: true, channel: target, ts: result.ts, text }
}

export async function postRoleMessage(role, text) {
  const map = {
    command: env.slack.channels.command,
    main: env.slack.channels.command,
    webdev: env.slack.channels.webdev,
    'shopify-dev': env.slack.channels.webdev,
    ops: env.slack.channels.ops,
    'ops-manager': env.slack.channels.ops,
    analyst: env.slack.channels.analyst,
    handoffs: env.slack.channels.handoffs,
    alerts: env.slack.channels.alerts,
  }
  return postSlackMessage({ channel: map[role] || env.slack.channels.command, text })
}

export async function postInitialCommandCentreMessage() {
  return postSlackMessage({
    channel: env.slack.channels.command,
    text: 'AI Command Centre is now connected. Pablo Escobot is online, Notion is live, and the command system is being wired into Slack.'
  })
}

export async function notifyTaskCompleted(task) {
  if (!client) return { ok: false, reason: 'Slack not configured' }

  const title   = task.title?.replace(/^[⚡🧱🎯🔥✅]\s*/, '') || 'Untitled Task'
  const company = task.company  || 'GRI'
  const type    = task.taskType || 'Task'
  const url     = task.notionUrl || ''

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '✅ Task Completed', emoji: true }
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*${title}*` }
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Brand:*\n${company}` },
        { type: 'mrkdwn', text: `*Type:*\n${type}` },
        { type: 'mrkdwn', text: `*Status:*\nDone ✓` },
        { type: 'mrkdwn', text: `*Completed:*\n${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })}` },
      ]
    },
    ...(url ? [{
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: 'View in Notion →', emoji: true },
        url,
        style: 'primary'
      }]
    }] : []),
    { type: 'divider' }
  ]

  // Post to alerts channel
  const alertsResult = await client.chat.postMessage({
    channel: env.slack.channels.alerts || env.slack.channels.command,
    text: `✅ Task completed: ${title}`,
    blocks
  })

  // Also try to DM Josh directly
  let dmResult = null
  try {
    const josh = process.env.SLACK_JOSH_USER_ID || env.slack.joshUserId || ''
    if (josh) {
      dmResult = await client.chat.postMessage({
        channel: josh,
        text: `✅ Task completed: ${title}`,
        blocks
      })
    }
  } catch(e) { /* DM optional — channel notification is primary */ }

  return { ok: true, alertsTs: alertsResult.ts, dmResult }
}

export async function postChannelVerificationSuite() {
  const tests = [
    ['main', 'Command channel live. Pablo Escobot is connected and command routing is ready.'],
    ['shopify-dev', 'Shopify Web Developer channel live. Theme-code workflow reporting is ready.'],
    ['ops-manager', 'Operations Manager channel live. Task and reporting coordination is ready.'],
    ['analyst', 'Analyst channel live. Findings and signal reporting is ready.'],
    ['handoffs', 'Handoffs channel live. Cross-agent task transfers can be routed here.'],
    ['alerts', 'Alerts channel live. Urgent incidents and high-priority issues can be routed here.'],
  ]
  const results = []
  for (const [role, text] of tests) {
    try {
      results.push({ role, ...(await postRoleMessage(role, text)) })
    } catch (error) {
      results.push({ role, ok: false, reason: String(error?.message || error) })
    }
  }
  return results
}
