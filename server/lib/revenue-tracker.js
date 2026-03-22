/**
 * Revenue Tracker — Fetch yesterday's Shopify sales
 * Daily revenue snapshot for executive briefing
 */

import { env } from './env.js'

const SHOPIFY_STORE = env.shopify.storeDomain || 'bdd19a-3.myshopify.com'
const SHOPIFY_TOKEN = env.shopify.adminAccessToken

/**
 * Get yesterday's sales for a company
 * @param {string} company - GRI, Lionzen, or GBU
 * @returns {Object} Revenue data
 */
export async function getYesterdaySales(company = 'GRI') {
  try {
    // Calculate yesterday's date range (midnight to midnight AEST)
    const now = new Date()
    const aestOffset = 10 * 60 * 60 * 1000 // AEST = UTC+10
    const aestNow = new Date(now.getTime() + aestOffset)
    
    const yesterday = new Date(aestNow)
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(0, 0, 0, 0)
    
    const yesterdayEnd = new Date(yesterday)
    yesterdayEnd.setHours(23, 59, 59, 999)
    
    const createdAtMin = yesterday.toISOString()
    const createdAtMax = yesterdayEnd.toISOString()
    
    console.log(`[Revenue] Fetching sales for ${company} from ${createdAtMin} to ${createdAtMax}`)
    
    // Fetch orders from Shopify
    const url = `https://${SHOPIFY_STORE}/admin/api/2024-01/orders.json?status=any&created_at_min=${createdAtMin}&created_at_max=${createdAtMax}&limit=250`
    
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_TOKEN,
        'Content-Type': 'application/json',
      }
    })
    
    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status}`)
    }
    
    const data = await response.json()
    const orders = data.orders || []
    
    // Calculate metrics
    const totalOrders = orders.length
    const totalRevenue = orders.reduce((sum, order) => sum + parseFloat(order.total_price || 0), 0)
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0
    
    // Top products
    const productSales = {}
    orders.forEach(order => {
      (order.line_items || []).forEach(item => {
        const title = item.title || 'Unknown'
        if (!productSales[title]) {
          productSales[title] = { title, quantity: 0, revenue: 0 }
        }
        productSales[title].quantity += item.quantity
        productSales[title].revenue += parseFloat(item.price) * item.quantity
      })
    })
    
    const topProducts = Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
    
    // Get same day last week for comparison
    const lastWeekSameDay = new Date(yesterday)
    lastWeekSameDay.setDate(lastWeekSameDay.getDate() - 7)
    lastWeekSameDay.setHours(0, 0, 0, 0)
    
    const lastWeekEnd = new Date(lastWeekSameDay)
    lastWeekEnd.setHours(23, 59, 59, 999)
    
    const lastWeekUrl = `https://${SHOPIFY_STORE}/admin/api/2024-01/orders.json?status=any&created_at_min=${lastWeekSameDay.toISOString()}&created_at_max=${lastWeekEnd.toISOString()}&limit=250`
    
    let lastWeekRevenue = 0
    let lastWeekOrders = 0
    try {
      const lastWeekResponse = await fetch(lastWeekUrl, {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_TOKEN,
          'Content-Type': 'application/json',
        }
      })
      
      if (lastWeekResponse.ok) {
        const lastWeekData = await lastWeekResponse.json()
        const lastWeekOrdersList = lastWeekData.orders || []
        lastWeekRevenue = lastWeekOrdersList.reduce((sum, order) => sum + parseFloat(order.total_price || 0), 0)
        lastWeekOrders = lastWeekOrdersList.length
      }
    } catch (e) {
      console.error('[Revenue] Failed to fetch last week same day:', e.message)
    }
    
    return {
      ok: true,
      company,
      date: yesterday.toISOString().split('T')[0],
      revenue: totalRevenue,
      orders: totalOrders,
      avgOrderValue,
      topProducts,
      comparison: {
        lastWeekSameDay: lastWeekRevenue,
        lastWeekOrders: lastWeekOrders,
        vsLastWeek: lastWeekRevenue > 0 ? ((totalRevenue - lastWeekRevenue) / lastWeekRevenue * 100) : 0,
      }
    }
  } catch (e) {
    console.error('[Revenue] Error:', e.message)
    return {
      ok: false,
      error: e.message
    }
  }
}

/**
 * Format revenue for briefing
 */
export function formatRevenueBriefing(data) {
  if (!data.ok) {
    return `❌ Revenue data unavailable: ${data.error}`
  }
  
  const { company, date, revenue, orders, avgOrderValue, topProducts, comparison } = data
  
  const vsLastWeekSymbol = comparison.vsLastWeek > 0 ? '📈' : '📉'
  const vsLastWeekSign = comparison.vsLastWeek > 0 ? '+' : ''
  
  let briefing = `📊 *REVENUE — ${date}*\n\n`
  briefing += `${company}:\n`
  briefing += `💰 $${revenue.toFixed(2)} (${orders} orders)\n`
  briefing += `📊 AOV: $${avgOrderValue.toFixed(2)}\n`
  briefing += `${vsLastWeekSymbol} ${vsLastWeekSign}${comparison.vsLastWeek.toFixed(0)}% vs same day last week ($${comparison.lastWeekSameDay.toFixed(2)})\n\n`
  
  if (topProducts.length > 0) {
    briefing += `*Top Products Yesterday:*\n`
    topProducts.forEach((p, i) => {
      briefing += `${i + 1}. ${p.title} — ${p.quantity} sales ($${p.revenue.toFixed(0)})\n`
    })
  }
  
  return briefing
}
