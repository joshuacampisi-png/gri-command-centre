/**
 * Sales Tracker — records daily sales + shipping from Shopify webhook events
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
  if (!sales[date]) sales[date] = { revenue: 0, shipping: 0, orders: 0, items: [] }
  // Backfill shipping field for old entries
  if (sales[date].shipping === undefined) sales[date].shipping = 0

  const total = parseFloat(order.total_price || 0)
  const shipping = (order.shipping_lines || []).reduce((sum, s) => sum + parseFloat(s.price || 0), 0)

  sales[date].revenue += total
  sales[date].shipping += shipping
  sales[date].orders += 1
  sales[date].items.push({
    name: order.name,
    total,
    shipping,
    time: new Date().toISOString(),
  })

  writeSales(sales)
  console.log(`[sales-tracker] Recorded ${order.name}: $${total.toFixed(2)} (shipping $${shipping.toFixed(2)}) — day total: $${sales[date].revenue.toFixed(2)}`)
}

/**
 * Get today's sales summary
 */
export function getTodaySales() {
  const date = todayKey()
  const sales = readSales()
  const today = sales[date] || { revenue: 0, shipping: 0, orders: 0 }
  return { ok: true, revenue: today.revenue, shipping: today.shipping || 0, orders: today.orders, date }
}

/**
 * Get sales for a date range
 * @param {string} from - YYYY-MM-DD
 * @param {string} to - YYYY-MM-DD
 */
export function getSalesRange(from, to) {
  const sales = readSales()
  let revenue = 0, shipping = 0, orders = 0
  for (const [date, day] of Object.entries(sales)) {
    if (date >= from && date <= to) {
      revenue += day.revenue || 0
      shipping += day.shipping || 0
      orders += day.orders || 0
    }
  }
  return { ok: true, revenue, shipping, orders, from, to }
}
