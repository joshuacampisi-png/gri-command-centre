import { existsSync, readFileSync, writeFileSync } from 'fs'
import { dataFile } from './data-dir.js'

const RETURNS_FILE = dataFile('returns.json')

function readReturns() {
  if (!existsSync(RETURNS_FILE)) return []
  try { return JSON.parse(readFileSync(RETURNS_FILE, 'utf8')) } catch { return [] }
}

function writeReturns(data) {
  writeFileSync(RETURNS_FILE, JSON.stringify(data, null, 2))
}

export function getAll() {
  return readReturns()
}

export function create(entry) {
  const returns = readReturns()
  const record = {
    id: 'R' + Date.now().toString(36).toUpperCase(),
    customer: entry.customer,
    order: entry.order,
    amount: parseFloat(entry.amount) || 0,
    products: entry.products,
    reason: entry.reason,
    date: entry.date || new Date().toISOString(),
    createdAt: new Date().toISOString(),
  }
  returns.unshift(record)
  writeReturns(returns)
  return record
}

export function remove(id) {
  const returns = readReturns()
  const filtered = returns.filter(r => r.id !== id)
  if (filtered.length === returns.length) return false
  writeReturns(filtered)
  return true
}
