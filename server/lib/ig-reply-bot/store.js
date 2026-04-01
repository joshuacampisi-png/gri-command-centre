/**
 * ig-reply-bot/store.js
 * JSON file CRUD for the Instagram reply bot.
 * Stores: config, replied comments (dedup), comment log, tone profile.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dataFile } from '../data-dir.js'

const CONFIG_FILE = dataFile('ig-reply-bot/config.json')
const REPLIED_FILE = dataFile('ig-reply-bot/replied-comments.json')
const LOG_FILE = dataFile('ig-reply-bot/comment-log.json')
const TONE_FILE = dataFile('ig-reply-bot/tone-profile.json')

const MAX_LOG_ENTRIES = 1000

// ── Helpers ─────────────────────────────────────────────────────────────────

function readJSON(path, fallback) {
  if (!existsSync(path)) return fallback
  try { return JSON.parse(readFileSync(path, 'utf8')) }
  catch { return fallback }
}

function writeJSON(path, data) {
  try { writeFileSync(path, JSON.stringify(data, null, 2)) }
  catch (e) { console.error(`[IG-Reply-Bot] Failed to write ${path}:`, e.message) }
}

// ── Config ──────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  enabled: false,
  createdAt: new Date().toISOString(),
  stats: { totalReplied: 0, totalSkipped: 0, lastReplyAt: null }
}

export function loadConfig() {
  return readJSON(CONFIG_FILE, { ...DEFAULT_CONFIG })
}

export function saveConfig(config) {
  writeJSON(CONFIG_FILE, config)
}

export function updateConfig(partial) {
  const config = loadConfig()
  Object.assign(config, partial)
  saveConfig(config)
  return config
}

// ── Replied Comments (dedup map) ────────────────────────────────────────────

export function loadReplied() {
  return readJSON(REPLIED_FILE, {})
}

export function isReplied(commentId) {
  const replied = loadReplied()
  return Boolean(replied[commentId])
}

export function markReplied(commentId, { replyId, postId, replyText }) {
  const replied = loadReplied()
  replied[commentId] = {
    repliedAt: new Date().toISOString(),
    replyId,
    postId,
    replyText
  }
  writeJSON(REPLIED_FILE, replied)

  // Update stats
  const config = loadConfig()
  config.stats.totalReplied = (config.stats.totalReplied || 0) + 1
  config.stats.lastReplyAt = new Date().toISOString()
  saveConfig(config)
}

// ── Comment Log ─────────────────────────────────────────────────────────────

export function getLog(limit = 50, offset = 0) {
  const log = readJSON(LOG_FILE, [])
  // Most recent first
  const sorted = log.sort((a, b) => new Date(b.processedAt) - new Date(a.processedAt))
  return {
    entries: sorted.slice(offset, offset + limit),
    total: sorted.length
  }
}

export function appendLog(entry) {
  const log = readJSON(LOG_FILE, [])
  log.push({
    ...entry,
    processedAt: new Date().toISOString()
  })
  // Keep only last N entries
  const trimmed = log.length > MAX_LOG_ENTRIES ? log.slice(-MAX_LOG_ENTRIES) : log
  writeJSON(LOG_FILE, trimmed)

  // Update skip stats
  if (entry.intent === 'skip' || !entry.replied) {
    const config = loadConfig()
    config.stats.totalSkipped = (config.stats.totalSkipped || 0) + 1
    saveConfig(config)
  }
}

// ── Tone Profile ────────────────────────────────────────────────────────────

export function loadToneProfile() {
  return readJSON(TONE_FILE, null)
}

export function saveToneProfile(profile, postCount) {
  writeJSON(TONE_FILE, {
    profile,
    extractedAt: new Date().toISOString(),
    postCount,
    version: 1
  })
}

// ── Stats ───────────────────────────────────────────────────────────────────

export function getStats() {
  const config = loadConfig()
  const log = readJSON(LOG_FILE, [])
  const tone = loadToneProfile()

  // Today's stats (AEST)
  const nowAEST = new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayEntries = log.filter(e => e.processedAt && e.processedAt.startsWith(todayStr))
  const repliesToday = todayEntries.filter(e => e.replied).length
  const skippedToday = todayEntries.filter(e => !e.replied).length

  return {
    enabled: config.enabled,
    totalReplied: config.stats.totalReplied || 0,
    totalSkipped: config.stats.totalSkipped || 0,
    lastReplyAt: config.stats.lastReplyAt,
    repliesToday,
    skippedToday,
    toneProfileAge: tone?.extractedAt || null,
    tonePostCount: tone?.postCount || 0
  }
}
