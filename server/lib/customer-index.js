/**
 * customer-index.js
 * Persistent customer email index for new-vs-returning classification.
 * Maps hashed emails to order history, enabling real nCAC calculation
 * without requiring Shopify read_customers scope.
 */
import { createHash } from 'crypto'
import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync } from 'fs'
import { dataFile, dataDir } from './data-dir.js'

dataDir('flywheel') // ensure directory exists

const INDEX_FILE = dataFile('flywheel/customer-index.json')

// ── Hash helper ────────────────────────────────────────────────────────────

function hashEmail(email) {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex')
}

// ── Persistence (reuses flywheel-store atomic write pattern) ────────────────

function loadIndex() {
  if (!existsSync(INDEX_FILE)) return {}
  try {
    const raw = readFileSync(INDEX_FILE, 'utf8')
    if (!raw || raw.trim().length === 0) return {}
    return JSON.parse(raw)
  } catch (err) {
    const bak = INDEX_FILE + '.bak'
    if (existsSync(bak)) {
      console.warn('[CustomerIndex] Main file corrupted, recovering from .bak')
      try {
        const bakRaw = readFileSync(bak, 'utf8')
        const data = JSON.parse(bakRaw)
        writeFileSync(INDEX_FILE, bakRaw)
        return data
      } catch { /* bak also bad */ }
    }
    console.error('[CustomerIndex] Unrecoverable, starting fresh')
    return {}
  }
}

function saveIndex(index) {
  const json = JSON.stringify(index, null, 2)
  const tmp = INDEX_FILE + '.tmp'
  const bak = INDEX_FILE + '.bak'

  try {
    writeFileSync(tmp, json)
    if (existsSync(INDEX_FILE)) {
      try { copyFileSync(INDEX_FILE, bak) } catch { /* ok if first write */ }
    }
    writeFileSync(INDEX_FILE, json)
    try { if (existsSync(tmp)) unlinkSync(tmp) } catch { /* ok */ }
  } catch (err) {
    console.error('[CustomerIndex] CRITICAL: Failed to save:', err.message)
    if (existsSync(tmp)) {
      try { writeFileSync(INDEX_FILE, readFileSync(tmp, 'utf8')) } catch { /* last resort */ }
    }
  }
}

// In-memory cache to avoid re-reading disk on every request
let _cache = null
let _cacheTime = 0
const CACHE_TTL = 60_000 // 1 minute

export function getIndex() {
  const now = Date.now()
  if (_cache && (now - _cacheTime) < CACHE_TTL) return _cache
  _cache = loadIndex()
  _cacheTime = now
  return _cache
}

function invalidateCache() {
  _cache = null
  _cacheTime = 0
}

// ── Core functions ─────────────────────────────────────────────────────────

/**
 * Extract email from a Shopify order object.
 * Returns lowercase trimmed email or null.
 */
export function extractEmail(order) {
  const email = order.contact_email || order.email || order.customer?.email
  if (!email || typeof email !== 'string') return null
  return email.toLowerCase().trim()
}

/**
 * Classify an order as new or returning based on the customer index.
 * Does NOT modify the index — use indexOrder() after classification.
 */
export function classifyOrder(order, index) {
  const email = extractEmail(order)
  if (!email) return { isNew: null, email: null, firstOrderAov: null, unknown: true }

  const hash = hashEmail(email)
  const existing = index[hash]

  if (!existing) {
    return {
      isNew: true,
      email,
      hash,
      firstOrderAov: parseFloat(order.total_price) || 0,
      unknown: false,
    }
  }

  return {
    isNew: false,
    email,
    hash,
    firstOrderAov: existing.firstOrderAov,
    orderCount: existing.orderCount,
    unknown: false,
  }
}

/**
 * Add or update a customer in the index.
 * If email is new, records firstOrderDate and firstOrderAov.
 * If email exists, increments orderCount and totalRevenue.
 */
export function indexOrder(order, index) {
  const email = extractEmail(order)
  if (!email) return false

  const hash = hashEmail(email)
  const aov = parseFloat(order.total_price) || 0
  const createdAt = order.created_at ? order.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10)

  if (!index[hash]) {
    index[hash] = {
      firstOrderDate: createdAt,
      firstOrderId: order.id?.toString() || order.name || '',
      firstOrderAov: aov,
      orderCount: 1,
      totalRevenue: aov,
      lastOrderDate: createdAt,
    }
    return true // new customer
  }

  // Existing customer — update
  index[hash].orderCount += 1
  index[hash].totalRevenue += aov
  index[hash].lastOrderDate = createdAt
  return false // returning customer
}

/**
 * Bootstrap the index from an array of historical orders.
 * Orders MUST be sorted by created_at ascending to correctly identify first purchases.
 */
export function bootstrapIndex(orders) {
  const index = {}
  let newCount = 0
  let returningCount = 0
  let unknownCount = 0

  for (const order of orders) {
    const email = extractEmail(order)
    if (!email) {
      unknownCount++
      continue
    }

    const wasNew = indexOrder(order, index)
    if (wasNew) newCount++
    else returningCount++
  }

  saveIndex(index)
  invalidateCache()

  return {
    totalOrders: orders.length,
    uniqueCustomers: Object.keys(index).length,
    newCustomers: newCount,
    returningOrders: returningCount,
    unknownOrders: unknownCount,
  }
}

/**
 * Index a single order in real time (webhook use).
 * Loads current index, updates it, saves back.
 */
export function indexOrderRealtime(order) {
  const index = getIndex()
  const wasNew = indexOrder(order, index)
  saveIndex(index)
  invalidateCache()
  return wasNew
}

// ── Query functions ────────────────────────────────────────────────────────

/**
 * Count new customers whose first order falls within a date range.
 */
export function getNewCustomerCount(index, fromDate, toDate) {
  let count = 0
  for (const entry of Object.values(index)) {
    if (entry.firstOrderDate >= fromDate && entry.firstOrderDate <= toDate) {
      count++
    }
  }
  return count
}

/**
 * Sum first-order revenue for new customers within a date range.
 */
export function getNewCustomerRevenue(index, fromDate, toDate) {
  let revenue = 0
  for (const entry of Object.values(index)) {
    if (entry.firstOrderDate >= fromDate && entry.firstOrderDate <= toDate) {
      revenue += entry.firstOrderAov
    }
  }
  return revenue
}

/**
 * Average first-order AOV for new customers within a date range.
 */
export function getFirstOrderAov(index, fromDate, toDate) {
  let sum = 0
  let count = 0
  for (const entry of Object.values(index)) {
    if (entry.firstOrderDate >= fromDate && entry.firstOrderDate <= toDate) {
      sum += entry.firstOrderAov
      count++
    }
  }
  return count > 0 ? sum / count : 0
}

/**
 * Get summary stats for a date range.
 */
export function getCustomerStats(index, fromDate, toDate) {
  const newCount = getNewCustomerCount(index, fromDate, toDate)
  const newRevenue = getNewCustomerRevenue(index, fromDate, toDate)
  const firstOrderAov = getFirstOrderAov(index, fromDate, toDate)
  const totalCustomers = Object.keys(index).length
  const repeatCustomers = Object.values(index).filter(e => e.orderCount > 1).length

  return {
    newCustomers: newCount,
    newCustomerRevenue: newRevenue,
    firstOrderAov,
    totalCustomers,
    repeatCustomers,
    repeatRate: totalCustomers > 0 ? repeatCustomers / totalCustomers : 0,
  }
}

/**
 * Classify an array of orders against the index.
 * Returns per-order classification plus aggregated counts.
 * Does NOT modify the index.
 */
export function classifyOrders(orders, index, fromDate, toDate) {
  let newCount = 0
  let returningCount = 0
  let unknownCount = 0
  let newRevenue = 0
  let returningRevenue = 0
  let firstOrderAovSum = 0

  // Track emails we've already seen in THIS batch to avoid double-counting
  // (e.g. if a customer placed 2 orders in the same period)
  const seenInBatch = new Set()

  for (const order of orders) {
    const email = extractEmail(order)
    if (!email) { unknownCount++; continue }

    const hash = hashEmail(email)
    const aov = parseFloat(order.aov || order.total_price) || 0

    // If we already saw this email in this batch, it's a repeat within the period
    if (seenInBatch.has(hash)) {
      returningCount++
      returningRevenue += aov
      continue
    }

    seenInBatch.add(hash)
    const existing = index[hash]

    // Determine if this customer is "new" within the query period:
    // If they exist in the index and their firstOrderDate falls within [fromDate, toDate],
    // they are a new customer for this period. If no dates provided, fall back to
    // whether they exist in the index at all.
    let isNew = false
    if (!existing) {
      isNew = true
    } else if (fromDate && existing.firstOrderDate) {
      isNew = existing.firstOrderDate >= fromDate && (!toDate || existing.firstOrderDate <= toDate + 'T23:59:59')
    }

    if (isNew) {
      newCount++
      newRevenue += aov
      firstOrderAovSum += aov
    } else {
      returningCount++
      returningRevenue += aov
    }
  }

  return {
    newCustomers: newCount,
    returningCustomers: returningCount,
    unknownOrders: unknownCount,
    newCustomerRevenue: newRevenue,
    returningCustomerRevenue: returningRevenue,
    firstOrderAov: newCount > 0 ? firstOrderAovSum / newCount : 0,
  }
}
