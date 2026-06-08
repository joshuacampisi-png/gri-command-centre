import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
async function gql(q){const r=await fetch(URL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q})});return r.json()}
import { writeFileSync } from 'fs'
const r = await gql(`{ collectionByHandle(handle:"gender-reveal-ideas-adelaide") { id descriptionHtml metafields(first:30){edges{node{namespace key type value}}} } }`)
const c = r.data?.collectionByHandle
writeFileSync('data/snapshots/adelaide-template.json', JSON.stringify(c, null, 2))
console.log('Adelaide descHtml length:', c?.descriptionHtml?.length)
console.log('Sample preview (first 1500c):')
console.log(c?.descriptionHtml?.slice(0,1500))
process.exit(0)
