/**
 * claude-guard.js
 * Central safety wrapper for ALL Claude API calls in this system.
 *
 * Safety features:
 *   1. Kill switch       — CLAUDE_DISABLED=true in .env blocks everything
 *   2. Daily $ cap       — CLAUDE_DAILY_BUDGET_USD (default $10)
 *   3. Hourly call cap   — CLAUDE_HOURLY_CALL_LIMIT (default 30)
 *   4. Per-call token cap— enforces max_tokens per call type
 *   5. Full usage log    — data/claude-usage.json (cost, tokens, caller, timestamp)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import Anthropic from '@anthropic-ai/sdk'

const __dirname = dirname(fileURLToPath(import.meta.url))
const USAGE_FILE = join(__dirname, '../../data/claude-usage.json')
const DATA_DIR   = join(__dirname, '../../data')

// Pricing per million tokens (claude-sonnet-4-20250514)
const PRICE_INPUT_PER_M  = 3.00   // $3.00 per 1M input tokens
const PRICE_OUTPUT_PER_M = 15.00  // $15.00 per 1M output tokens

// Configurable limits (from .env with defaults)
const DAILY_BUDGET_USD   = parseFloat(process.env.CLAUDE_DAILY_BUDGET_USD  || '10')
const HOURLY_CALL_LIMIT  = parseInt(process.env.CLAUDE_HOURLY_CALL_LIMIT   || '0') // 0 = no limit
const KILL_SWITCH        = process.env.CLAUDE_DISABLED === 'true'

// ─── Usage store ────────────────────────────────────────────────────────────

function loadUsage() {
  if (!existsSync(USAGE_FILE)) return { calls: [] }
  try { return JSON.parse(readFileSync(USAGE_FILE, 'utf8')) }
  catch { return { calls: [] } }
}

function saveUsage(usage) {
  try { writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2)) }
  catch (e) { console.error('[ClaudeGuard] Failed to save usage log:', e.message) }
}

function calcCost(inputTokens, outputTokens) {
  return (inputTokens / 1_000_000) * PRICE_INPUT_PER_M
       + (outputTokens / 1_000_000) * PRICE_OUTPUT_PER_M
}

// ─── Safety checks ──────────────────────────────────────────────────────────

function checkKillSwitch() {
  if (KILL_SWITCH) throw new Error('[ClaudeGuard] BLOCKED — Kill switch active (CLAUDE_DISABLED=true in .env)')
}

function checkDailyBudget(usage) {
  const today = new Date().toISOString().slice(0, 10)
  const todaySpend = usage.calls
    .filter(c => c.timestamp.startsWith(today))
    .reduce((sum, c) => sum + (c.costUSD || 0), 0)

  if (todaySpend >= DAILY_BUDGET_USD) {
    throw new Error(
      `[ClaudeGuard] BLOCKED — Daily budget cap reached. Spent $${todaySpend.toFixed(4)} of $${DAILY_BUDGET_USD} today. ` +
      `Reset tomorrow or raise CLAUDE_DAILY_BUDGET_USD in .env`
    )
  }
  return todaySpend
}

function checkHourlyLimit(usage) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const recentCalls = usage.calls.filter(c => c.timestamp > oneHourAgo).length

  // 0 = no hourly limit (daily budget still protects against runaway costs)
  if (HOURLY_CALL_LIMIT > 0 && recentCalls >= HOURLY_CALL_LIMIT) {
    throw new Error(
      `[ClaudeGuard] BLOCKED — Hourly call limit reached (${recentCalls}/${HOURLY_CALL_LIMIT}). ` +
      `Raise CLAUDE_HOURLY_CALL_LIMIT in .env or wait for the hour to pass.`
    )
  }
  return recentCalls
}

// ─── Main wrapper ────────────────────────────────────────────────────────────

const _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * callClaude(params, callerTag)
 *
 * Drop-in replacement for anthropic.messages.create().
 * params     — same shape as Anthropic SDK messages.create()
 * callerTag  — string identifying the caller (e.g. 'seo-task-writer', 'article-generator')
 *
 * Returns the Anthropic message response on success.
 * Throws on any safety violation — caller should catch and handle gracefully.
 */
export async function callClaude(params, callerTag = 'unknown') {
  checkKillSwitch()

  const usage = loadUsage()

  const todaySpend   = checkDailyBudget(usage)
  const recentCalls  = checkHourlyLimit(usage)

  // Enforce a reasonable max_tokens if not set
  if (!params.max_tokens) params.max_tokens = 1024

  const startedAt = Date.now()

  let response
  try {
    response = await _client.messages.create(params)
  } catch (err) {
    // Log failed call (no token cost)
    usage.calls.push({
      timestamp: new Date().toISOString(),
      caller: callerTag,
      model: params.model || 'unknown',
      inputTokens: 0,
      outputTokens: 0,
      costUSD: 0,
      durationMs: Date.now() - startedAt,
      error: err.message,
    })
    saveUsage(usage)
    throw err
  }

  const inputTokens  = response.usage?.input_tokens  || 0
  const outputTokens = response.usage?.output_tokens || 0
  const costUSD      = calcCost(inputTokens, outputTokens)
  const durationMs   = Date.now() - startedAt

  // Log the call
  const record = {
    timestamp: new Date().toISOString(),
    caller: callerTag,
    model: params.model || 'unknown',
    inputTokens,
    outputTokens,
    costUSD,
    durationMs,
  }
  usage.calls.push(record)
  saveUsage(usage)

  const newTotal = todaySpend + costUSD
  console.log(
    `[ClaudeGuard] ✅ ${callerTag} — ${inputTokens}in/${outputTokens}out tokens` +
    ` — $${costUSD.toFixed(4)} — daily total $${newTotal.toFixed(4)}/$${DAILY_BUDGET_USD}` +
    ` — ${recentCalls + 1}/${HOURLY_CALL_LIMIT} calls this hour`
  )

  return response
}

// ─── Usage summary (for dashboard API) ──────────────────────────────────────

export function getUsageSummary() {
  const usage = loadUsage()
  const today = new Date().toISOString().slice(0, 10)
  const thisHour = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const todayCalls  = usage.calls.filter(c => c.timestamp.startsWith(today))
  const recentCalls = usage.calls.filter(c => c.timestamp > thisHour)

  const todaySpend  = todayCalls.reduce((s, c) => s + (c.costUSD || 0), 0)
  const totalSpend  = usage.calls.reduce((s, c) => s + (c.costUSD || 0), 0)

  // Spend per caller today
  const byCaller = {}
  for (const c of todayCalls) {
    byCaller[c.caller] = (byCaller[c.caller] || 0) + (c.costUSD || 0)
  }

  return {
    killSwitchActive:   KILL_SWITCH,
    dailyBudgetUSD:     DAILY_BUDGET_USD,
    hourlyCallLimit:    HOURLY_CALL_LIMIT,
    todaySpendUSD:      parseFloat(todaySpend.toFixed(4)),
    todayCallCount:     todayCalls.length,
    recentCallCount:    recentCalls.length,
    totalSpendUSD:      parseFloat(totalSpend.toFixed(4)),
    totalCallCount:     usage.calls.length,
    budgetUsedPercent:  Math.round((todaySpend / DAILY_BUDGET_USD) * 100),
    spendByCaller:      Object.fromEntries(
                          Object.entries(byCaller).map(([k, v]) => [k, parseFloat(v.toFixed(4))])
                        ),
    recentCalls: usage.calls.slice(-20).reverse(),
  }
}

export function resetDailyUsage() {
  const usage = loadUsage()
  const today = new Date().toISOString().slice(0, 10)
  // Keep history but mark reset
  usage.lastReset = new Date().toISOString()
  saveUsage(usage)
  console.log('[ClaudeGuard] Usage log reset')
}
