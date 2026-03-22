/**
 * Sales Tracker — records daily sales from Shopify webhook events
 * Stores to data/daily-sales.json so we don't need read_orders scope
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const DATA_DIR = join(process.cwd(), 'data')
const SALES_FILE = join(DATA_DIR, 'daily-sales.json')

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

function readSales() {
  if (!existsSync(SALES_FILE)) return {}
  try { return JSON.parse(readFileSync(SALES_FILE, 'utf8')) } catch { return {} }
}

function writeSales(data) {
  writeFileSync(SALES_FILE, JSON.stringify(data, null, 2))
}

function todayKey() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })
}

/**
 * Record an order from Shopify webhook
 */
export function recordOrder(order) {
  const date = todayKey()
  const sales = readSales()
  if (!sales[date]) sales[date] = { revenue: 0, orders: 0, items: [] }

  const total = parseFloat(order.total_price || 0)
  sales[date].revenue += total
  sales[date].orders += 1
  sales[date].items.push({
    name: order.name,
    total,
    time: new Date().toISOString(),
  })

  writeSales(sales)
  console.log(`[sales-tracker] Recorded ${order.name}: $${total.toFixed(2)} — day total: $${sales[date].revenue.toFixed(2)}`)
}

/**
 * Get today's sales summary
 */
export function getTodaySales() {
  const date = todayKey()
  const sales = readSales()
  const today = sales[date] || { revenue: 0, orders: 0 }
  return { ok: true, revenue: today.revenue, orders: today.orders, date }
}
