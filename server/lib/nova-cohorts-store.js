/**
 * NovaPeptides cohorts (reps/affiliates who earn a % commission per sale).
 * Persists to the Railway volume via data-dir.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dataFile } from './data-dir.js'

const FILE = dataFile('nova-cohorts.json')

function read() {
  try {
    if (!existsSync(FILE)) return []
    const a = JSON.parse(readFileSync(FILE, 'utf8'))
    return Array.isArray(a) ? a : []
  } catch (e) { console.error('[NovaCohorts] read failed:', e.message); return [] }
}
function write(c) {
  try { writeFileSync(FILE, JSON.stringify(c, null, 2)) }
  catch (e) { console.error('[NovaCohorts] write failed:', e.message) }
}

export function listCohorts() {
  return read().sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}

export function addCohort({ name, pct }) {
  const nm = String(name || '').slice(0, 40).trim()
  if (!nm) return null
  const c = read()
  const cohort = {
    id: 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: nm,
    pct: Math.max(0, Math.min(100, Number(pct) || 0))
  }
  c.push(cohort)
  write(c)
  return cohort
}

export function deleteCohort(id) {
  write(read().filter(c => c.id !== id))
  return true
}
