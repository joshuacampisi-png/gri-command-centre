/**
 * Sales Tracker — records daily sales + shipping + shipping protection from Shopify webhook events
 * Stores to data/daily-sales.json so we don't need read_orders scope
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { dataFile } from './data-dir.js'

const SALES_FILE = dataFile('daily-sales.json')
const PROTECTION_FILE = dataFile('shipping-protection.json')

// Shipping Protection product ID from Shopify
const SHIPPING_PROTECTION_PRODUCT_ID = 8156417196121
const SHIPPING_PROTECTION_PRICE = 3.00

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

  // Track shipping protection if this order has it
  const hasProtection = (order.line_items || []).some(
    item => item.product_id === SHIPPING_PROTECTION_PRODUCT_ID
      || (item.title || '').toLowerCase().includes('shipping protection')
  )
  if (hasProtection) {
    recordShippingProtection(order.name, date)
  }
}

// ── Shipping Protection Tracker ─────────────────────────────────────────────

function readProtection() {
  if (!existsSync(PROTECTION_FILE)) return { lifetime: { count: 0, revenue: 0 }, daily: {}, orders: [] }
  try { return JSON.parse(readFileSync(PROTECTION_FILE, 'utf8')) } catch { return { lifetime: { count: 0, revenue: 0 }, daily: {}, orders: [] } }
}

function writeProtection(data) {
  writeFileSync(PROTECTION_FILE, JSON.stringify(data, null, 2))
}

function recordShippingProtection(orderName, date) {
  const prot = readProtection()

  // Prevent double counting
  if (prot.orders.includes(orderName)) return

  prot.lifetime.count += 1
  prot.lifetime.revenue += SHIPPING_PROTECTION_PRICE

  if (!prot.daily[date]) prot.daily[date] = { count: 0, revenue: 0 }
  prot.daily[date].count += 1
  prot.daily[date].revenue += SHIPPING_PROTECTION_PRICE

  prot.orders.push(orderName)

  writeProtection(prot)
  console.log(`[sales-tracker] Shipping protection recorded for ${orderName} — lifetime: $${prot.lifetime.revenue.toFixed(2)} (${prot.lifetime.count} orders)`)
}

/**
 * Get shipping protection stats
 */
export function getShippingProtection() {
  const prot = readProtection()
  const date = todayKey()
  const today = prot.daily[date] || { count: 0, revenue: 0 }

  // This week (Mon-Sun)
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Brisbane' }))
  const day = now.getDay()
  const daysSinceMon = (day === 0 ? 6 : day - 1)
  const mon = new Date(now)
  mon.setDate(now.getDate() - daysSinceMon)
  mon.setHours(0, 0, 0, 0)
  const monKey = mon.toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })
  const sunKey = new Date(mon.getTime() + 6 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })

  let weekCount = 0, weekRevenue = 0
  for (const [d, v] of Object.entries(prot.daily)) {
    if (d >= monKey && d <= sunKey) {
      weekCount += v.count
      weekRevenue += v.revenue
    }
  }

  // This month
  const monthKey = date.slice(0, 7) // YYYY-MM
  let monthCount = 0, monthRevenue = 0
  for (const [d, v] of Object.entries(prot.daily)) {
    if (d.startsWith(monthKey)) {
      monthCount += v.count
      monthRevenue += v.revenue
    }
  }

  return {
    ok: true,
    today: { count: today.count, revenue: today.revenue },
    week: { count: weekCount, revenue: weekRevenue },
    month: { count: monthCount, revenue: monthRevenue },
    lifetime: prot.lifetime,
    pricePerOrder: SHIPPING_PROTECTION_PRICE,
  }
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
