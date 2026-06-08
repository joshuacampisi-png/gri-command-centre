import 'dotenv/config'
import { writeFileSync } from 'fs'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
const r = await fetch(`${REST}/pages/131482091609.json`, { headers:{'X-Shopify-Access-Token':TOKEN} })
const j = await r.json()
writeFileSync('/tmp/gri-ai-info.html', j.page.body_html)
console.log(`Saved to /tmp/gri-ai-info.html (${j.page.body_html.length} chars)`)
process.exit(0)
