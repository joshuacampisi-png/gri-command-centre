/**
 * gads-agent-store.js
 * JSON-backed data store for the Google Ads Agent.
 * Atomic writes with .bak recovery, mirrored from flywheel-store.js.
 *
 * Stores: recommendations, briefings, audit log, config.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync } from 'fs'
import { randomUUID } from 'crypto'
import { dataFile, dataDir } from './data-dir.js'

// Ensure directories exist
dataDir('gads-agent')
dataDir('gads-agent/backups')

const FILES = {
  recommendations: dataFile('gads-agent/recommendations.json'),
  briefings:       dataFile('gads-agent/briefings.json'),
  auditLog:        dataFile('gads-agent/audit-log.json'),
  config:          dataFile('gads-agent/config.json'),
}

// ── Atomic JSON helpers ─────────────────────────────────────────────────────

function loadArr(file) {
  if (!existsSync(file)) return []
  try {
    const raw = readFileSync(file, 'utf8')
    if (!raw || raw.trim().length === 0) return []
    return JSON.parse(raw)
  } catch {
    const bak = file + '.bak'
    if (existsSync(bak)) {
      try {
        const bakRaw = readFileSync(bak, 'utf8')
        writeFileSync(file, bakRaw)
        return JSON.parse(bakRaw)
      } catch { /* fall through */ }
    }
    console.error(`[GadsAgentStore] ${file} unrecoverable, starting fresh`)
    return []
  }
}

function loadObj(file) {
  if (!existsSync(file)) return {}
  try {
    const raw = readFileSync(file, 'utf8')
    if (!raw || raw.trim().length === 0) return {}
    return JSON.parse(raw)
  } catch {
    const bak = file + '.bak'
    if (existsSync(bak)) {
      try {
        const bakRaw = readFileSync(bak, 'utf8')
        writeFileSync(file, bakRaw)
        return JSON.parse(bakRaw)
      } catch { /* fall through */ }
    }
    return {}
  }
}

function save(file, data) {
  const json = JSON.stringify(data, null, 2)
  const tmp = file + '.tmp'
  const bak = file + '.bak'
  try {
    writeFileSync(tmp, json)
    if (existsSync(file)) {
      try { copyFileSync(file, bak) } catch { /* ok on first write */ }
    }
    writeFileSync(file, json)
    try { if (existsSync(tmp)) unlinkSync(tmp) } catch { /* ok */ }
  } catch (err) {
    console.error(`[GadsAgentStore] CRITICAL: Failed to save ${file}:`, err.message)
  }
}

function now() { return new Date().toISOString() }

// ── Config (thresholds + dry-run flag) ──────────────────────────────────────

const DEFAULT_CONFIG = {
  dryRun: true, // START IN DRY-RUN for the first 48 hours — per Josh

  // Business constants
  breakevenCppAud:    49.35,
  avgOrderValueAud:   108.00,
  grossMarginPct:     0.47,
  targetRoas:         3.0,

  // Keyword bleed thresholds
  keywordBleedThresholdAud: 35.00,
  negativeKwMinClicks:      3,
  negativeKwMaxCtr:         0.02,
  zeroImpressionDays:       14,

  // Campaign bleed thresholds
  campaignBleedThresholdAud: 75.00,
  campaignBleedDays:         5,

  // Reallocation triggers
  reallocationLowRoas:  0.80,
  reallocationHighRoas: 1.40,

  // Quality score
  lowQualityScoreThreshold: 5,
  lowQualityMinImpressions: 100,

  // Bid scale opportunity
  bidScaleMinConvRate:  0.05,
  bidScaleCppMultiplier: 0.7,

  // Revert thresholds
  accuracyCheckDays:        7,
  accuracyMaterialisedPct:  0.40, // if actual >= 40% of projected, keep. Otherwise revert.

  // Week-1 redistribute constraint (2026-04-05):
  // Josh doesn't want to add any new spend in week 1 — only redistribute
  // existing spend to the best positions. When true, the engine suppresses
  // any finding whose forecast shows net_spend_change > 0.
  redistributeModeOnly: true,

  // Scan cadence (handled by cron, here for visibility)
  activeHoursStart: 6,
  activeHoursEnd:   22,
  activeScanMinutes:     60,
  overnightScanMinutes:  240,
  dailyAuditHourAest:    6,
}

export function getConfig() {
  const saved = loadObj(FILES.config)
  if (!saved || Object.keys(saved).length === 0) {
    save(FILES.config, DEFAULT_CONFIG)
    return { ...DEFAULT_CONFIG }
  }
  return { ...DEFAULT_CONFIG, ...saved }
}

export function updateConfig(patch) {
  const current = getConfig()
  const next = { ...current, ...patch, updatedAt: now() }
  save(FILES.config, next)
  return next
}

export function isDryRun() {
  try {
    return !!getConfig().dryRun
  } catch {
    return true // fail-safe: if config is unreadable, default to dry-run
  }
}

// ── Recommendations ─────────────────────────────────────────────────────────
//
// status lifecycle:
//   pending -> approved -> completed -> (accuracy_checked | reverted) | dismissed

export function getRecommendations(status = null) {
  const all = loadArr(FILES.recommendations)
  if (!status) return all
  if (status === 'pending') return all.filter(r => r.status === 'pending')
  if (status === 'needs-review') return all.filter(r => r.status === 'needs-review')
  if (status === 'active')  return all.filter(r => r.status === 'pending' || r.status === 'completed')
  return all.filter(r => r.status === status)
}

export function getRecommendationById(id) {
  return loadArr(FILES.recommendations).find(r => r.id === id) || null
}

export function addRecommendation(rec) {
  const all = loadArr(FILES.recommendations)
  const record = {
    id: randomUUID(),
    status: rec.status || 'pending', // 'pending' (default), 'needs-review' (preflight failed)
    priority: rec.priority || 999,
    severity: rec.severity || 'medium',
    category: rec.category,
    issueTitle: rec.issueTitle,
    whatToFix: rec.whatToFix || '',
    whyItShouldChange: rec.whyItShouldChange || '',
    projectedDollarImpact: rec.projectedDollarImpact || 0,
    projectedImpactDirection: rec.projectedImpactDirection || 'save',
    currentValue: rec.currentValue || {},
    proposedChange: rec.proposedChange || {},
    bestPracticeSource: rec.bestPracticeSource || '',
    bestPracticeSummary: rec.bestPracticeSummary || '',
    entityType: rec.entityType || '',
    entityId: rec.entityId || '',
    entityName: rec.entityName || '',
    forecast: rec.forecast || null, // fixed forecast math: current/projected/delta/assumptions/confidence
    campaignContext: rec.campaignContext || null,
    fingerprint: rec.fingerprint || '', // for dedup
    createdAt: now(),
    approvedAt: null,
    dismissedAt: null,
    executedAt: null,
    executionResult: null,
    accuracyCheckDueAt: null,
    accuracyCheckedAt: null,
    actualDollarImpact: null,
    accuracyDelta: null,
    revertedAt: null,
    revertReason: null,
    revertResult: null,
  }
  all.push(record)
  save(FILES.recommendations, all)
  return record
}

export function updateRecommendation(id, patch) {
  const all = loadArr(FILES.recommendations)
  const idx = all.findIndex(r => r.id === id)
  if (idx < 0) return null
  all[idx] = { ...all[idx], ...patch, updatedAt: now() }
  save(FILES.recommendations, all)
  return all[idx]
}

/**
 * Deduplication: given a set of new recommendation fingerprints, return only
 * those that don't already exist as pending or completed.
 */
export function getExistingActiveFingerprints() {
  const all = loadArr(FILES.recommendations)
  const active = all.filter(r => r.status === 'pending' || r.status === 'completed')
  return new Set(active.map(r => r.fingerprint).filter(Boolean))
}

// ── Briefings ───────────────────────────────────────────────────────────────

export function getLatestBriefing() {
  const all = loadArr(FILES.briefings)
  if (all.length === 0) return null
  return [...all].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
}

export function getBriefings(limit = 14) {
  const all = loadArr(FILES.briefings)
  return [...all].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit)
}

export function addBriefing(briefing) {
  const all = loadArr(FILES.briefings)
  const record = {
    id: randomUUID(),
    briefingDate: briefing.briefingDate || new Date().toISOString().split('T')[0],
    algorithmUpdates:      briefing.algorithmUpdates || '',
    seasonalOpportunities: briefing.seasonalOpportunities || '',
    competitorSignals:     briefing.competitorSignals || '',
    accountHealthSummary:  briefing.accountHealthSummary || '',
    createdAt: now(),
  }
  // Replace today's briefing if one already exists
  const todayIdx = all.findIndex(b => b.briefingDate === record.briefingDate)
  if (todayIdx >= 0) {
    all[todayIdx] = { ...all[todayIdx], ...record, updatedAt: now() }
  } else {
    all.push(record)
  }
  save(FILES.briefings, all)
  return record
}

// ── Audit log ───────────────────────────────────────────────────────────────

export function getAuditLog(limit = 200) {
  const all = loadArr(FILES.auditLog)
  return [...all].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit)
}

export function logAudit(eventType, details, recommendationId = null, triggeredBy = 'agent') {
  const all = loadArr(FILES.auditLog)
  all.push({
    id: randomUUID(),
    eventType,
    recommendationId,
    details: details || {},
    triggeredBy,
    createdAt: now(),
  })
  // Cap to last 2000 events
  if (all.length > 2000) all.splice(0, all.length - 2000)
  save(FILES.auditLog, all)
}

// ── Health ──────────────────────────────────────────────────────────────────

export function getStoreHealth() {
  const recs = loadArr(FILES.recommendations)
  const briefings = loadArr(FILES.briefings)
  const audit = loadArr(FILES.auditLog)
  return {
    dryRun: isDryRun(),
    recommendations: {
      total: recs.length,
      pending: recs.filter(r => r.status === 'pending').length,
      completed: recs.filter(r => r.status === 'completed').length,
      dismissed: recs.filter(r => r.status === 'dismissed').length,
      reverted: recs.filter(r => r.status === 'reverted').length,
    },
    briefings: briefings.length,
    auditEvents: audit.length,
    lastAudit: audit.length > 0 ? audit[audit.length - 1].createdAt : null,
  }
}
