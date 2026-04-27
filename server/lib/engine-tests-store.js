/**
 * engine-tests-store.js
 *
 * JSON-backed store for active title tests (and other Engine experiments).
 * Each test:
 *   - 3 products max (no-bulk rule)
 *   - 7-day window
 *   - hypothesis + revert trigger documented
 *   - automated win/lose evaluation against baseline
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'

const STORE_PATH = './data/engine/active-tests.json'

function ensureDir() {
  const dir = dirname(STORE_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function read() {
  ensureDir()
  if (!existsSync(STORE_PATH)) return { tests: [] }
  try { return JSON.parse(readFileSync(STORE_PATH, 'utf8')) }
  catch { return { tests: [] } }
}

function write(data) {
  ensureDir()
  writeFileSync(STORE_PATH, JSON.stringify(data, null, 2))
}

export function listTests() {
  return read().tests || []
}

export function getTest(id) {
  return read().tests.find(t => t.id === id) || null
}

export function createTest(payload) {
  const data = read()
  const id = `test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const test = {
    id,
    name: payload.name || 'Untitled test',
    type: payload.type || 'title', // title | feed | bid | network
    hypothesis: payload.hypothesis || '',
    revertTrigger: payload.revertTrigger || 'No improvement after 7 days',
    products: payload.products || [], // [{id, title, before, after}]
    metric: payload.metric || 'roas', // roas | impressions | conversions | ctr
    baseline: payload.baseline || null, // captured pre-state
    startedAt: new Date().toISOString(),
    durationDays: payload.durationDays || 7,
    status: 'active', // active | won | lost | inconclusive | reverted
    notes: [],
  }
  data.tests = data.tests || []
  data.tests.unshift(test)
  write(data)
  return test
}

export function updateTest(id, patch) {
  const data = read()
  const idx = data.tests.findIndex(t => t.id === id)
  if (idx === -1) return null
  data.tests[idx] = { ...data.tests[idx], ...patch, updatedAt: new Date().toISOString() }
  write(data)
  return data.tests[idx]
}

export function addTestNote(id, note) {
  const data = read()
  const t = data.tests.find(x => x.id === id)
  if (!t) return null
  t.notes = t.notes || []
  t.notes.unshift({ at: new Date().toISOString(), note })
  write(data)
  return t
}

export function deleteTest(id) {
  const data = read()
  data.tests = (data.tests || []).filter(t => t.id !== id)
  write(data)
  return true
}

/**
 * Annotate a test with derived state for the UI:
 *   - daysIn (since startedAt)
 *   - daysRemaining
 *   - readyToJudge (>= durationDays)
 */
export function annotateTest(t) {
  const start = new Date(t.startedAt)
  const now = new Date()
  const daysIn = Math.floor((now - start) / 86400000)
  const daysRemaining = Math.max(0, t.durationDays - daysIn)
  const readyToJudge = daysIn >= t.durationDays
  return { ...t, daysIn, daysRemaining, readyToJudge }
}
