import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
const r = await fetch(`${REST}/smart_collections/468151861337.json`,{headers:{'X-Shopify-Access-Token':TOKEN}})
const j = await r.json()
process.stdout.write(j.smart_collection.body_html)
process.exit(0)
