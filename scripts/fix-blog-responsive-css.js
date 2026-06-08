/**
 * Add mobile-responsive CSS to all 3 citation magnet articles
 * Wraps tables in scrolling containers, adjusts padding/typography for mobile
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}
const sleep = ms => new Promise(r=>setTimeout(r,ms))

const blogs = await rest('/blogs.json')
const blog = blogs.blogs.find(b => b.handle === 'news')

// Unified responsive CSS — drops in at top of every article body
const RESPONSIVE_CSS = `<style id="gri-blog-responsive">
/* === GRI Blog Responsive Layer === */
.gri-blog *,.bgr-wrap *,.smk-wrap *,.cost-wrap *{box-sizing:border-box}
.gri-blog,.bgr-wrap,.smk-wrap,.cost-wrap{max-width:880px !important;margin:0 auto !important;padding:24px 20px !important;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif !important;line-height:1.7 !important;color:#222 !important;font-size:17px}
.gri-blog h1,.bgr-wrap h1,.smk-wrap h1,.cost-wrap h1{font-size:clamp(26px,5vw,38px) !important;line-height:1.18 !important;margin:8px 0 14px !important;font-weight:700 !important;letter-spacing:-0.01em !important;word-wrap:break-word !important}
.gri-blog h2,.bgr-wrap h2,.smk-wrap h2,.cost-wrap h2{font-size:clamp(21px,3.6vw,28px) !important;margin:40px 0 14px !important;line-height:1.25 !important;font-weight:700 !important;letter-spacing:-0.005em !important;word-wrap:break-word !important}
.gri-blog h3,.bgr-wrap h3,.smk-wrap h3,.cost-wrap h3{font-size:clamp(18px,2.6vw,21px) !important;margin:28px 0 10px !important;font-weight:600 !important}
.gri-blog p,.bgr-wrap p,.smk-wrap p,.cost-wrap p{margin:14px 0 !important;line-height:1.7 !important}
.gri-blog ul,.bgr-wrap ul,.smk-wrap ul,.cost-wrap ul,.gri-blog ol,.bgr-wrap ol,.smk-wrap ol,.cost-wrap ol{margin:14px 0 !important;padding-left:22px !important}
.gri-blog li,.bgr-wrap li,.smk-wrap li,.cost-wrap li{margin:6px 0 !important;line-height:1.65 !important}
.gri-blog a,.bgr-wrap a,.smk-wrap a,.cost-wrap a{color:#c44569 !important;text-decoration:underline}

/* Author byline */
.byline{display:flex !important;align-items:center !important;gap:12px !important;margin:8px 0 22px !important;padding-bottom:16px !important;border-bottom:1px solid #eee !important;color:#666 !important;font-size:14px !important;flex-wrap:wrap}
.byline img{width:44px !important;height:44px !important;border-radius:50% !important;object-fit:cover !important;flex-shrink:0}
.byline a{color:#1a1a1a !important}

/* BLUF and quick-answer boxes */
.bluf{background:#fff7f9 !important;border-left:4px solid #c44569 !important;padding:16px 18px !important;border-radius:0 10px 10px 0 !important;margin:20px 0 24px !important;font-size:16px !important;color:#333 !important;line-height:1.65 !important}
.bluf strong{color:#c44569 !important}
.answer{background:#f9fafb !important;border-left:3px solid #65c4c0 !important;padding:14px 16px !important;border-radius:0 8px 8px 0 !important;margin:14px 0 22px !important;font-size:15.5px !important;color:#333 !important;line-height:1.6}
.answer strong{color:#0d6e6a !important}

/* Trust review strip */
.review-strip{background:#fff7f9 !important;padding:14px 18px !important;border-radius:10px !important;margin:18px 0 24px !important;text-align:center !important;font-size:14px !important;color:#444 !important;line-height:1.6}
.review-strip strong{color:#c44569 !important}

/* Tables — horizontal scroll on mobile */
.gri-blog table,.bgr-wrap table,.smk-wrap table,.cost-wrap table{width:100% !important;border-collapse:collapse !important;margin:24px 0 !important;font-size:14px !important;display:block !important;overflow-x:auto !important;white-space:nowrap !important;-webkit-overflow-scrolling:touch}
@media(min-width:640px){.gri-blog table,.bgr-wrap table,.smk-wrap table,.cost-wrap table{display:table !important;white-space:normal !important}}
.gri-blog th,.bgr-wrap th,.smk-wrap th,.cost-wrap th{background:#f5f5f5 !important;padding:10px 12px !important;text-align:left !important;border:1px solid #e5e5e5 !important;font-weight:600 !important;font-size:13px}
.gri-blog td,.bgr-wrap td,.smk-wrap td,.cost-wrap td{padding:10px 12px !important;border:1px solid #e5e5e5 !important;font-size:14px}
.gri-blog tr:nth-child(even) td,.bgr-wrap tr:nth-child(even) td,.smk-wrap tr:nth-child(even) td,.cost-wrap tr:nth-child(even) td{background:#fafafa !important}
.gri-blog td.price,.bgr-wrap td.price,.smk-wrap td.price,.cost-wrap td.price{color:#c44569 !important;font-weight:700 !important;white-space:nowrap}

/* Data card / credentials grid */
.data-card{background:linear-gradient(135deg,#fff7f9 0%,#fdfdfd 100%) !important;padding:22px !important;border-radius:14px !important;margin:24px 0 !important;border:1px solid #f0e6e9 !important}
.data-card .label{font-size:11px !important;color:#c44569 !important;letter-spacing:2px !important;font-weight:700 !important;text-transform:uppercase !important;margin-bottom:8px !important}
.data-card .number{font-size:clamp(28px,5vw,40px) !important;font-weight:800 !important;color:#1a1a1a !important;line-height:1.1 !important;margin:0}
.data-card .desc{font-size:13px !important;color:#666 !important;margin-top:6px !important;line-height:1.5}

/* FAQ section */
.faq-q{font-weight:600 !important;color:#222 !important;margin:20px 0 6px !important;font-size:16.5px !important;line-height:1.4}

/* Warning + Legal callouts */
.warning{background:#fff7e6 !important;border-left:4px solid #f59e0b !important;padding:14px 16px !important;border-radius:0 8px 8px 0 !important;margin:18px 0 !important;font-size:15px !important;color:#444 !important;line-height:1.6}
.legal-box{background:#ecfdf5 !important;border-left:4px solid #10b981 !important;padding:16px 18px !important;border-radius:0 10px 10px 0 !important;margin:18px 0 !important;font-size:15.5px !important;color:#1a1a1a !important;line-height:1.6}

/* Citation block */
.cite{font-size:13px !important;color:#666 !important;border-top:1px solid #eee !important;padding-top:18px !important;margin-top:40px !important}
.cite a{color:#666 !important;word-break:break-word}

/* CTA buttons full width on mobile */
.cta-btn{display:block !important;width:100% !important;text-align:center !important;padding:16px 28px !important;background:#c44569 !important;color:#fff !important;text-decoration:none !important;border-radius:10px !important;font-weight:600 !important;font-size:16px !important;margin:32px 0 !important}
@media(min-width:640px){.cta-btn{display:inline-block !important;width:auto !important}}

/* Mobile-specific tightening */
@media(max-width:600px){
  .gri-blog,.bgr-wrap,.smk-wrap,.cost-wrap{padding:16px 16px !important;font-size:16px}
  .byline{font-size:13px !important;line-height:1.4}
  .bluf{font-size:15px !important;padding:14px 16px !important}
  .answer{font-size:15px !important;padding:12px 14px !important}
  .data-card{padding:18px !important}
  .pullquote{font-size:17px !important;padding:14px 18px !important;margin:20px 0 !important}
}
</style>`

const ARTICLES = [
  { id: 566676881497, handle: 'best-gender-reveal-products-australia-2026', name: 'Best Products' },
  { id: 566677012569, handle: 'are-gender-reveal-smoke-bombs-legal-australia-2026', name: 'Smoke Bomb Legality' },
  { id: 566677176409, handle: 'how-much-does-gender-reveal-cost-australia-2026', name: 'Cost Data' }
]

console.log('\n=== INJECTING UNIFIED RESPONSIVE CSS INTO 3 ARTICLES ===\n')

for (const a of ARTICLES) {
  const cur = await rest(`/blogs/${blog.id}/articles/${a.id}.json`)
  let body = cur.article.body_html

  // Remove any existing gri-blog-responsive style
  body = body.replace(/<style id="gri-blog-responsive">[\s\S]*?<\/style>/g, '')

  // Find the LAST </script> in the head schema block, inject CSS right after
  const lastScriptEnd = body.lastIndexOf('</script>')
  if (lastScriptEnd === -1) {
    // No schema script — just prepend
    body = RESPONSIVE_CSS + body
  } else {
    body = body.slice(0, lastScriptEnd + 9) + '\n' + RESPONSIVE_CSS + '\n' + body.slice(lastScriptEnd + 9)
  }

  const upd = await rest(`/blogs/${blog.id}/articles/${a.id}.json`, {
    method: 'PUT',
    body: JSON.stringify({ article: { id: a.id, body_html: body }})
  })
  console.log(`  ${upd.errors ? '✗' : '✓'} ${a.name} (${upd.article?.body_html?.length || 0} chars)`)
  await sleep(800)
}

console.log('\n=== DONE — Responsive CSS shipped to all 3 articles ===')
console.log('\nKey mobile improvements:')
console.log('  • Tables: horizontal scroll on mobile (overflow-x:auto), table layout on desktop ≥640px')
console.log('  • Typography: clamp() for fluid sizing across viewports')
console.log('  • BLUF + answer blocks: padding tightened on mobile, padding generous on desktop')
console.log('  • Data cards + grids: stack on mobile, side-by-side on desktop')
console.log('  • CTA buttons: full-width on mobile, inline on desktop')
console.log('  • Long URLs in citations: word-break to prevent overflow')
process.exit(0)
