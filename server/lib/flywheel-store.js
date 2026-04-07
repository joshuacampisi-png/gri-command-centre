/**
 * flywheel-store.js
 * JSON-based data store for the Ads Intelligence Flywheel.
 * Stores conversions, snapshots, kill events, briefs, AOV intelligence,
 * alerts, CPA targets, weekly rhythm, agent actions, and learning log.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'
import { dataFile, dataDir } from './data-dir.js'
import { randomUUID } from 'crypto'

// ── File paths ──────────────────────────────────────────────────────────────

dataDir('flywheel') // ensure directory exists
dataDir('flywheel/backups') // backup directory

const FILES = {
  conversions:    dataFile('flywheel/conversions.json'),
  adSnapshots:    dataFile('flywheel/ad-snapshots.json'),
  adSetSnapshots: dataFile('flywheel/adset-snapshots.json'),
  campaigns:      dataFile('flywheel/campaigns.json'),
  adSets:         dataFile('flywheel/adsets.json'),
  ads:            dataFile('flywheel/ads.json'),
  killEvents:     dataFile('flywheel/kill-events.json'),
  scaleEvents:    dataFile('flywheel/scale-events.json'),
  alerts:         dataFile('flywheel/alerts.json'),
  briefs:         dataFile('flywheel/creative-briefs.json'),
  aovIntel:       dataFile('flywheel/aov-intelligence.json'),
  cpaTargets:     dataFile('flywheel/cpa-targets.json'),
  weeklyRhythm:   dataFile('flywheel/weekly-rhythm.json'),
  pendingActions: dataFile('flywheel/pending-actions.json'),
  agentLearning:  dataFile('flywheel/agent-learning.json'),
  industryKnowledge: dataFile('flywheel/industry-knowledge.json'),
  flywheelLog:    dataFile('flywheel/flywheel-log.json'),
}

// ── Generic helpers ─────────────────────────────────────────────────────────

function load(file) {
  if (!existsSync(file)) return []
  try {
    const raw = readFileSync(file, 'utf8')
    if (!raw || raw.trim().length === 0) return []
    return JSON.parse(raw)
  } catch (err) {
    // If main file is corrupted, try the .bak file
    const bak = file + '.bak'
    if (existsSync(bak)) {
      console.warn(`[Flywheel Store] ${file} corrupted, recovering from .bak`)
      try {
        const bakRaw = readFileSync(bak, 'utf8')
        const data = JSON.parse(bakRaw)
        // Restore the main file from backup
        writeFileSync(file, bakRaw)
        return data
      } catch { /* bak also bad, return empty */ }
    }
    console.error(`[Flywheel Store] ${file} unrecoverable, starting fresh`)
    return []
  }
}

/**
 * Atomic write: write to .tmp first, then rename.
 * Also keeps a .bak of the previous version.
 * This prevents data loss if the process crashes mid-write.
 */
function save(file, data) {
  const json = JSON.stringify(data, null, 2)
  const tmp = file + '.tmp'
  const bak = file + '.bak'

  try {
    // 1. Write to temp file first (atomic step 1)
    writeFileSync(tmp, json)

    // 2. Backup current file before overwriting
    if (existsSync(file)) {
      try { copyFileSync(file, bak) } catch { /* ok if first write */ }
    }

    // 3. Rename temp to main (atomic step 2 — this is the commit)
    writeFileSync(file, json)

    // 4. Clean up temp
    try { if (existsSync(tmp)) unlinkSync(tmp) } catch { /* ok */ }
  } catch (err) {
    console.error(`[Flywheel Store] CRITICAL: Failed to save ${file}:`, err.message)
    // If main write failed but tmp exists, try to recover
    if (existsSync(tmp)) {
      try { writeFileSync(file, readFileSync(tmp, 'utf8')) } catch { /* last resort failed */ }
    }
  }
}

function loadObj(file) {
  if (!existsSync(file)) return {}
  try {
    const raw = readFileSync(file, 'utf8')
    if (!raw || raw.trim().length === 0) return {}
    return JSON.parse(raw)
  } catch (err) {
    const bak = file + '.bak'
    if (existsSync(bak)) {
      console.warn(`[Flywheel Store] ${file} corrupted, recovering from .bak`)
      try {
        const bakRaw = readFileSync(bak, 'utf8')
        const data = JSON.parse(bakRaw)
        writeFileSync(file, bakRaw)
        return data
      } catch { /* bak also bad */ }
    }
    return {}
  }
}

// ── Daily Backup System ─────────────────────────────────────────────────────
// Creates a daily snapshot of all critical flywheel data.
// Keeps last 14 daily backups. Runs automatically.

const BACKUP_DIR = dataDir('flywheel/backups')
const CRITICAL_FILES = [
  'conversions', 'adSnapshots', 'adSetSnapshots', 'campaigns', 'adSets',
  'ads', 'briefs', 'aovIntel', 'cpaTargets', 'pendingActions', 'agentLearning',
]

export function runDailyBackup() {
  const today = new Date().toISOString().split('T')[0]
  const backupSubdir = dataDir(`flywheel/backups/${today}`)

  let backedUp = 0
  for (const key of CRITICAL_FILES) {
    const src = FILES[key]
    if (src && existsSync(src)) {
      try {
        const dest = join(backupSubdir, key + '.json')
        copyFileSync(src, dest)
        backedUp++
      } catch (err) {
        console.error(`[Flywheel Backup] Failed to backup ${key}:`, err.message)
      }
    }
  }

  // Clean old backups (keep last 14 days)
  try {
    const backups = readdirSync(BACKUP_DIR)
      .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort()
    if (backups.length > 14) {
      const toDelete = backups.slice(0, backups.length - 14)
      for (const old of toDelete) {
        const oldDir = join(BACKUP_DIR, old)
        try {
          const files = readdirSync(oldDir)
          for (const f of files) unlinkSync(join(oldDir, f))
        } catch { /* ok if cleanup fails */ }
      }
    }
  } catch { /* ok */ }

  console.log(`[Flywheel Backup] Daily backup complete: ${backedUp} files saved to ${today}`)
  return { date: today, files: backedUp }
}

// ── Health Check ────────────────────────────────────────────────────────────

export function getFlywheelHealth() {
  const health = { status: 'healthy', issues: [], files: {}, lastEvents: {} }

  // Check each critical file exists and is valid JSON
  for (const [key, file] of Object.entries(FILES)) {
    if (!existsSync(file)) {
      health.files[key] = { exists: false, size: 0 }
      continue
    }
    try {
      const stat = statSync(file)
      const raw = readFileSync(file, 'utf8')
      JSON.parse(raw) // validate JSON
      health.files[key] = {
        exists: true,
        size: stat.size,
        modified: stat.mtime.toISOString(),
        records: Array.isArray(JSON.parse(raw)) ? JSON.parse(raw).length : 'object',
      }
    } catch (err) {
      health.files[key] = { exists: true, corrupted: true, error: err.message }
      health.issues.push(`${key} is corrupted: ${err.message}`)
      health.status = 'degraded'
    }
  }

  // Check last flywheel log event
  const logData = load(FILES.flywheelLog)
  if (logData.length > 0) {
    const last = logData[logData.length - 1]
    health.lastEvents.lastLog = { type: last.type, timestamp: last.timestamp }
    // If last event is older than 24 hours, flag it
    const hoursSinceLast = (Date.now() - new Date(last.timestamp).getTime()) / (1000 * 60 * 60)
    if (hoursSinceLast > 24) {
      health.issues.push(`No flywheel events in ${Math.round(hoursSinceLast)} hours`)
      health.status = 'warning'
    }
  }

  // Check conversions are flowing
  const conversions = load(FILES.conversions)
  health.lastEvents.totalConversions = conversions.length
  if (conversions.length > 0) {
    const lastConv = conversions[conversions.length - 1]
    health.lastEvents.lastConversion = lastConv.orderedAt
  }

  // Check snapshots are being collected
  const snapshots = load(FILES.adSnapshots)
  health.lastEvents.totalSnapshots = snapshots.length
  if (snapshots.length > 0) {
    const lastSnap = snapshots[snapshots.length - 1]
    health.lastEvents.lastSnapshot = lastSnap.date || lastSnap.createdAt
  }

  // Check backup status
  try {
    const backupDays = readdirSync(BACKUP_DIR).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    health.backups = { totalDays: backupDays.length, latest: backupDays.sort().pop() || 'none' }
  } catch {
    health.backups = { totalDays: 0, latest: 'none' }
  }

  return health
}

function now() { return new Date().toISOString() }

// ── Conversions (Shopify orders joined to Meta ads) ─────────────────────────

export function getConversions(days = 30) {
  const all = load(FILES.conversions)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return all.filter(c => new Date(c.orderedAt) >= cutoff)
}

export function getConversionByOrderId(orderId) {
  const all = load(FILES.conversions)
  return all.find(c => c.shopifyOrderId === orderId)
}

export function upsertConversion(conv) {
  const all = load(FILES.conversions)
  const idx = all.findIndex(c => c.shopifyOrderId === conv.shopifyOrderId)
  const record = {
    id: conv.id || randomUUID(),
    ...conv,
    createdAt: conv.createdAt || now(),
    updatedAt: now(),
  }
  if (idx >= 0) { all[idx] = { ...all[idx], ...record, updatedAt: now() } }
  else { all.push(record) }
  save(FILES.conversions, all)
  return record
}

// ── Campaign / AdSet / Ad registries ────────────────────────────────────────

export function getCampaigns() { return load(FILES.campaigns) }
export function saveCampaigns(data) { save(FILES.campaigns, data) }

export function getAdSets() { return load(FILES.adSets) }
export function saveAdSets(data) { save(FILES.adSets, data) }

export function getAds() { return load(FILES.ads) }
export function saveAds(data) { save(FILES.ads, data) }

// ── Ad Snapshots (daily performance per ad) ─────────────────────────────────

export function getAdSnapshots(adId, days = 30) {
  const all = load(FILES.adSnapshots)
  if (!adId) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    return all.filter(s => new Date(s.date) >= cutoff)
  }
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return all.filter(s => s.adId === adId && new Date(s.date) >= cutoff)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
}

export function upsertAdSnapshot(snap) {
  const all = load(FILES.adSnapshots)
  const key = `${snap.adId}_${snap.date}`
  const idx = all.findIndex(s => `${s.adId}_${s.date}` === key)
  const record = { id: randomUUID(), ...snap, createdAt: now() }
  if (idx >= 0) { all[idx] = { ...all[idx], ...snap, updatedAt: now() } }
  else { all.push(record) }
  save(FILES.adSnapshots, all)
  return record
}

// ── AdSet Snapshots ─────────────────────────────────────────────────────────

export function getAdSetSnapshots(adSetId, days = 30) {
  const all = load(FILES.adSetSnapshots)
  if (!adSetId) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    return all.filter(s => new Date(s.date) >= cutoff)
  }
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return all.filter(s => s.adSetId === adSetId && new Date(s.date) >= cutoff)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
}

export function upsertAdSetSnapshot(snap) {
  const all = load(FILES.adSetSnapshots)
  const key = `${snap.adSetId}_${snap.date}`
  const idx = all.findIndex(s => `${s.adSetId}_${s.date}` === key)
  const record = { id: randomUUID(), ...snap, createdAt: now() }
  if (idx >= 0) { all[idx] = { ...all[idx], ...snap, updatedAt: now() } }
  else { all.push(record) }
  save(FILES.adSetSnapshots, all)
  return record
}

// ── Kill Rule Events ────────────────────────────────────────────────────────

export function getKillEvents(days = 30) {
  const all = load(FILES.killEvents)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return all.filter(e => new Date(e.createdAt) >= cutoff)
}

export function addKillEvent(event) {
  const all = load(FILES.killEvents)
  const record = { id: randomUUID(), ...event, createdAt: now() }
  all.push(record)
  save(FILES.killEvents, all)
  return record
}

// ── Scale Events ────────────────────────────────────────────────────────────

export function getScaleEvents(days = 30) {
  const all = load(FILES.scaleEvents)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return all.filter(e => new Date(e.createdAt) >= cutoff)
}

export function addScaleEvent(event) {
  const all = load(FILES.scaleEvents)
  const record = { id: randomUUID(), ...event, createdAt: now() }
  all.push(record)
  save(FILES.scaleEvents, all)
  return record
}

// ── System Alerts ───────────────────────────────────────────────────────────

export function getAlerts(unresolvedOnly = true) {
  const all = load(FILES.alerts)
  if (unresolvedOnly) return all.filter(a => !a.resolved)
  return all
}

export function addAlert(alert) {
  const all = load(FILES.alerts)

  // Deduplicate: if an unresolved alert already exists for same entity + type, skip
  const isDupe = all.some(a =>
    !a.resolved &&
    a.entityId === (alert.entityId || null) &&
    a.type === alert.type
  )
  if (isDupe) return null

  const record = {
    id: randomUUID(),
    type: alert.type,
    severity: alert.severity,
    title: alert.title,
    body: alert.body,
    entityType: alert.entityType || null,
    entityId: alert.entityId || null,
    entityName: alert.entityName || null,
    resolved: false,
    resolvedAt: null,
    createdAt: now(),
  }
  all.push(record)
  save(FILES.alerts, all)
  return record
}

// Deduplicate existing unresolved alerts on boot — keeps only the newest per entity+type
export function deduplicateAlerts() {
  const all = load(FILES.alerts)
  const seen = new Map()
  let dupes = 0
  // Walk newest-first so we keep the most recent
  for (let i = all.length - 1; i >= 0; i--) {
    const a = all[i]
    if (a.resolved) continue
    const key = `${a.entityId || ''}_${a.type || ''}`
    if (seen.has(key)) {
      all[i].resolved = true
      all[i].resolvedAt = now()
      dupes++
    } else {
      seen.set(key, true)
    }
  }
  if (dupes > 0) {
    save(FILES.alerts, all)
    console.log(`[Flywheel] Auto-resolved ${dupes} duplicate alerts`)
  }
  return dupes
}

export function resolveAlert(alertId) {
  const all = load(FILES.alerts)
  const idx = all.findIndex(a => a.id === alertId)
  if (idx >= 0) {
    all[idx].resolved = true
    all[idx].resolvedAt = now()
    save(FILES.alerts, all)
    return all[idx]
  }
  return null
}

// ── Creative Briefs ─────────────────────────────────────────────────────────

export function getBriefs(limit = 10) {
  const all = load(FILES.briefs)
  return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit)
}

export function getLatestBrief() {
  const all = load(FILES.briefs)
  if (all.length === 0) return null
  return all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
}

export function addBrief(brief) {
  const all = load(FILES.briefs)
  const record = {
    id: randomUUID(),
    weekOf: brief.weekOf,
    generatedFrom: brief.generatedFrom || {},
    winningAngles: brief.winningAngles || [],
    aovInsights: brief.aovInsights || {},
    hookRecommended: brief.hookRecommended || '',
    formatRecommended: brief.formatRecommended || '',
    productFocus: brief.productFocus || '',
    fullBrief: brief.fullBrief || '',
    status: 'draft',
    createdAt: now(),
  }
  all.push(record)
  save(FILES.briefs, all)
  return record
}

export function approveBrief(briefId) {
  const all = load(FILES.briefs)
  const idx = all.findIndex(b => b.id === briefId)
  if (idx >= 0) {
    all[idx].status = 'approved'
    all[idx].approvedAt = now()
    save(FILES.briefs, all)
    return all[idx]
  }
  return null
}

// ── AOV Intelligence ────────────────────────────────────────────────────────

export function getAovIntel(days = 30) {
  const all = load(FILES.aovIntel)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return all.filter(a => new Date(a.date) >= cutoff)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
}

export function upsertAovIntel(intel) {
  const all = load(FILES.aovIntel)
  const idx = all.findIndex(a => a.date === intel.date)
  const record = { id: randomUUID(), ...intel, createdAt: now() }
  if (idx >= 0) { all[idx] = { ...all[idx], ...intel, updatedAt: now() } }
  else { all.push(record) }
  save(FILES.aovIntel, all)
  return record
}

// ── CPA Targets ─────────────────────────────────────────────────────────────

const DEFAULT_CPA_TARGETS = {
  cannon:          { target: 25, max: 62.50,  category: 'cannon' },
  smoke:           { target: 18, max: 45.00,  category: 'smoke' },
  bundle_full:     { target: 35, max: 87.50,  category: 'bundle_full' },
  bundle_starter:  { target: 20, max: 50.00,  category: 'bundle_starter' },
  hire:            { target: 80, max: 200.00, category: 'hire' },
  accessory:       { target: 15, max: 37.50,  category: 'accessory' },
  blended:         { target: 28, max: 70.00,  category: 'blended' },
}

export function getCpaTargets() {
  const saved = loadObj(FILES.cpaTargets)
  if (Object.keys(saved).length === 0) {
    save(FILES.cpaTargets, DEFAULT_CPA_TARGETS)
    return DEFAULT_CPA_TARGETS
  }
  return { ...DEFAULT_CPA_TARGETS, ...saved }
}

export function updateCpaTarget(category, target) {
  const all = getCpaTargets()
  all[category] = {
    ...all[category],
    target,
    max: target * 2.5,
    category,
    updatedAt: now(),
  }
  save(FILES.cpaTargets, all)
  return all[category]
}

// ── Weekly Rhythm ───────────────────────────────────────────────────────────

export function getWeeklyRhythm() {
  const all = load(FILES.weeklyRhythm)
  const thisWeek = getWeekStart()
  let rhythm = all.find(r => r.weekOf === thisWeek)
  if (!rhythm) {
    rhythm = {
      id: randomUUID(),
      weekOf: thisWeek,
      mondayDone: false,
      wednesdayDone: false,
      fridayDone: false,
      actions: [],
      createdAt: now(),
    }
    all.push(rhythm)
    save(FILES.weeklyRhythm, all)
  }
  return rhythm
}

export function markRhythmDay(day) {
  const all = load(FILES.weeklyRhythm)
  const thisWeek = getWeekStart()
  const idx = all.findIndex(r => r.weekOf === thisWeek)
  if (idx >= 0) {
    all[idx][`${day}Done`] = true
    all[idx].updatedAt = now()
    save(FILES.weeklyRhythm, all)
    return all[idx]
  }
  return null
}

function getWeekStart() {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.setDate(diff))
  return monday.toISOString().split('T')[0]
}

// ── Pending Actions (AI agent recommendations) ──────────────────────────────

export function getPendingActions(status = 'awaiting_approval') {
  const all = load(FILES.pendingActions)
  if (status === 'all') return all
  return all.filter(a => a.status === status)
}

export function addPendingAction(action) {
  const all = load(FILES.pendingActions)
  const record = {
    id: randomUUID(),
    ...action,
    status: 'awaiting_approval',
    createdAt: now(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }
  all.push(record)
  save(FILES.pendingActions, all)
  return record
}

export function approveAction(actionId) {
  const all = load(FILES.pendingActions)
  const idx = all.findIndex(a => a.id === actionId)
  if (idx >= 0) {
    all[idx].status = 'approved'
    all[idx].approvedAt = now()
    all[idx].approvedBy = 'josh'
    save(FILES.pendingActions, all)
    return all[idx]
  }
  return null
}

export function rejectAction(actionId, reason = '') {
  const all = load(FILES.pendingActions)
  const idx = all.findIndex(a => a.id === actionId)
  if (idx >= 0) {
    all[idx].status = 'rejected'
    all[idx].rejectedAt = now()
    all[idx].rejectionReason = reason
    save(FILES.pendingActions, all)
    return all[idx]
  }
  return null
}

export function markActionExecuted(actionId, result) {
  const all = load(FILES.pendingActions)
  const idx = all.findIndex(a => a.id === actionId)
  if (idx >= 0) {
    all[idx].status = 'executed'
    all[idx].executedAt = now()
    all[idx].executionResult = result
    save(FILES.pendingActions, all)
    return all[idx]
  }
  return null
}

export function recordActionOutcome(actionId, outcome) {
  const all = load(FILES.pendingActions)
  const idx = all.findIndex(a => a.id === actionId)
  if (idx >= 0) {
    all[idx].outcomeMeasuredAt = now()
    all[idx].outcomeRoasBefore = outcome.roasBefore
    all[idx].outcomeRoasAfter = outcome.roasAfter
    all[idx].outcomeCpaBefore = outcome.cpaBefore
    all[idx].outcomeCpaAfter = outcome.cpaAfter
    all[idx].outcomeNotes = outcome.notes
    all[idx].outcomeRating = outcome.rating
    save(FILES.pendingActions, all)
    return all[idx]
  }
  return null
}

// ── Agent Learning ──────────────────────────────────────────────────────────

export function getAgentLearning(limit = 50) {
  const all = load(FILES.agentLearning)
  return all.sort((a, b) => new Date(b.learnedAt) - new Date(a.learnedAt)).slice(0, limit)
}

export function addAgentLearning(entry) {
  const all = load(FILES.agentLearning)
  const record = {
    id: randomUUID(),
    ...entry,
    learnedAt: now(),
  }
  all.push(record)
  save(FILES.agentLearning, all)
  return record
}

// ── Industry Knowledge Base ─────────────────────────────────────────────────

export function getIndustryKnowledge() {
  return loadObj(FILES.industryKnowledge)
}

export function saveIndustryKnowledge(data) {
  save(FILES.industryKnowledge, data)
}

// ── Flywheel Log (human readable feed of everything that happened) ──────────

export function getFlywheelLog(days = 14) {
  const all = load(FILES.flywheelLog)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return all.filter(e => new Date(e.timestamp) >= cutoff)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
}

export function logFlywheelEvent(type, detail) {
  const all = load(FILES.flywheelLog)
  all.push({
    id: randomUUID(),
    type,
    detail,
    timestamp: now(),
  })
  // Keep last 500 events max
  if (all.length > 500) all.splice(0, all.length - 500)
  save(FILES.flywheelLog, all)
}
