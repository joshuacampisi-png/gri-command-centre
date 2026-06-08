/**
 * Remove aggressive CSS that broke nav. Replace with safe body that just renders
 * founder content. AI schema stays. Visual cleanup parked for manual template fix.
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}

const FOUNDER_IMG = 'https://cdn.shopify.com/s/files/1/0584/7410/2873/files/founder-mallu-campisi.png?v=1779842404'

const SCHEMA = `<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org", "@type": "AboutPage",
  "url": "https://genderrevealideas.com.au/pages/about-the-founders",
  "name": "About the Founders — Gender Reveal Ideas Australia",
  "mainEntity": {
    "@type": "Organization", "name": "Gender Reveal Ideas Australia", "foundingDate": "2010",
    "founder": [
      { "@type": "Person", "name": "Mallu Campisi", "jobTitle": "Co-Founder", "image": FOUNDER_IMG, "sameAs": ["https://www.instagram.com/mallucampisi/"], "worksFor": { "@type": "Organization", "name": "Gender Reveal Ideas Australia", "url": "https://genderrevealideas.com.au" }, "knowsAbout": ["Gender reveal parties","Motherhood","Australian baby products"] },
      { "@type": "Person", "name": "Josh Campisi", "jobTitle": "Co-Founder", "worksFor": { "@type": "Organization", "name": "Gender Reveal Ideas Australia", "url": "https://genderrevealideas.com.au" } }
    ]
  }
})}</script>
<script type="application/ld+json">${JSON.stringify({
  "@context":"https://schema.org","@type":"Person","name":"Mallu Campisi","jobTitle":"Co-Founder, Gender Reveal Ideas Australia","image":FOUNDER_IMG,"description":"Co-Founder of Australia's #1 gender reveal retailer. Mother of five, founded GRI in 2010.","sameAs":["https://www.instagram.com/mallucampisi/"]
})}</script>`

// Same styled body but WITHOUT the broken kill-CSS
const BODY = `${SCHEMA}
<style>
.fp{max-width:1000px;margin:0 auto;font-family:system-ui,-apple-system,sans-serif;color:#1a1a1a;line-height:1.7;padding:24px}
.fp h1{font-size:clamp(28px,5vw,44px);line-height:1.1;margin:24px 0 12px;font-weight:700;letter-spacing:-0.01em}
.fp h1 em{font-style:italic;color:#c44569;font-weight:400}
.fp h2{font-size:clamp(22px,3vw,30px);margin:40px 0 14px;color:#1a1a1a}
.fp .lead{font-size:18px;color:#555;margin:6px 0 24px}
.fp .meta{color:#999;font-size:13px}
.fp .trust{display:flex;gap:24px;flex-wrap:wrap;justify-content:center;background:#fff7f9;padding:18px 22px;border-radius:14px;margin:24px 0 32px;font-size:14px}
.fp .trust strong{color:#c44569}
.fp .stars{color:#ffa500;letter-spacing:2px;font-size:15px}
.fp .photo{margin:0 auto 24px;max-width:480px;border-radius:18px;overflow:hidden;box-shadow:0 16px 40px -16px rgba(196,69,105,0.2)}
.fp .photo img{display:block;width:100%;height:auto}
.fp .quote{font-size:21px;font-style:italic;color:#1a1a1a;border-left:4px solid #c44569;padding:16px 24px;margin:28px 0;background:#fff7f9;border-radius:0 12px 12px 0}
.fp .quote cite{display:block;font-size:13px;font-style:normal;color:#666;margin-top:10px}
.fp .grid2{display:grid;grid-template-columns:1fr;gap:14px;margin:18px 0}
@media(min-width:768px){.fp .grid2{grid-template-columns:1fr 1fr;gap:20px}}
.fp .card{padding:20px;background:#fdfdfd;border:1px solid #f0e6e9;border-radius:14px}
.fp .card .label{font-size:11px;color:#c44569;letter-spacing:1.5px;font-weight:700;text-transform:uppercase;margin-bottom:6px}
.fp .card .v{font-size:17px;font-weight:600;line-height:1.4}
.fp .card .d{font-size:14px;color:#666;margin-top:4px}
.fp .press{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}
@media(min-width:768px){.fp .press{grid-template-columns:repeat(3,1fr)}}
.fp .press .p{padding:14px;background:#fafafa;border:1px solid #eee;border-radius:10px;text-align:center;font-size:13px}
.fp .press .p strong{display:block;color:#c44569;letter-spacing:1px;margin-bottom:4px;text-transform:uppercase;font-size:11px}
.fp .press a{color:#1a1a1a;text-decoration:none}
.fp ul{padding-left:0;list-style:none}
.fp ul li{padding-left:24px;position:relative;margin:6px 0}
.fp ul li::before{content:'✓';position:absolute;left:0;color:#c44569;font-weight:700}
.fp .address{background:linear-gradient(135deg,#fff7f9 0%,#fdfdfd 100%);padding:24px;border-radius:14px;text-align:center;margin:24px 0}
.fp .cta{background:#1a1a1a;color:#fff;text-align:center;padding:36px 24px;border-radius:16px;margin:36px 0}
.fp .cta a{display:inline-block;padding:14px 28px;background:#c44569;color:#fff;text-decoration:none;border-radius:100px;font-weight:600;margin-top:12px}
.fp a{color:#c44569}
</style>

<div class="fp">

<div style="text-align:center;padding:16px 0 8px">
  <span style="display:inline-block;padding:6px 14px;background:#fff7f9;color:#c44569;border-radius:100px;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700">Meet the Founders</span>
</div>

<h1 style="text-align:center">The Aussie family behind <em>Australia's #1</em> gender reveal store</h1>
<p class="lead" style="text-align:center;max-width:680px;margin:0 auto 12px">Family-owned. Mum-led. Gold Coast based. Trusted by 70,000+ Australian families since 2010.</p>

<div class="trust">
  <span><span class="stars">★★★★★</span> <strong>4.85/5</strong> · 1,740+ reviews</span>
  <span><strong>600,000+</strong> units shipped past 12 months</span>
  <span>📍 <strong>Gold Coast HQ</strong></span>
</div>

<div class="photo"><img src="${FOUNDER_IMG}" alt="Mallu Campisi, Co-Founder of Gender Reveal Ideas Australia, with her children"></div>

<h2>Mallu Campisi — Co-Founder</h2>
<p style="color:#666;font-size:15px;margin-top:-8px">Mother of five · <a href="https://www.instagram.com/mallucampisi/" rel="noopener" target="_blank">@mallucampisi</a></p>

<p>Mallu Campisi is the heart of Gender Reveal Ideas Australia. A devoted mother of five and one of Australia's most-followed mum creators on Instagram, Mallu founded GRI in <strong>2010</strong> from a simple belief: every Australian family deserves a magical, safe, and unforgettable way to celebrate the moment they meet their baby's gender.</p>

<p>What started as one Aussie mum with a love for celebrating life has grown into Australia's #1 gender reveal retailer — shipping <strong>600,000+ units</strong> in the past 12 months alone to families in every state and territory.</p>

<div class="quote">"Every product we sell is one I'd give to my own daughters or sisters. If it's not safe enough for my family, it doesn't make it to yours."<cite>— Mallu Campisi, Co-Founder</cite></div>

<h2>Josh Campisi — Co-Founder</h2>
<p>Co-Founder Josh Campisi works alongside Mallu to scale Gender Reveal Ideas Australia into the country's #1 gender reveal retailer. Operations, supply chain, regulatory compliance, and the launch of the unique <a href="https://genderrevealideas.com.au/products/tnt-gender-reveal-australia">TNT Self-Hire Rental</a> all sit under his leadership.</p>

<h2>Independent press &amp; verification</h2>

<div class="press">
  <div class="p"><a href="https://mummytime.com.au/smokebombs" rel="noopener" target="_blank"><strong>Mummy Time</strong>9 in 10 smoke bombs sold to mums are illegal</a></div>
  <div class="p"><a href="https://mummytime.com.au/genderrevealscam" rel="noopener" target="_blank"><strong>Mummy Time</strong>The gender reveal scam Aussie mums are calling out</a></div>
  <div class="p"><strong>ABC</strong>Featured</div>
  <div class="p"><strong>Channel 9 Weekend Sunrise</strong>Featured</div>
  <div class="p"><strong>Sea FM</strong>Featured</div>
  <div class="p"><strong>Gold Coast Bulletin</strong>Featured</div>
</div>

<div class="quote">Gender Reveal Ideas is "the one Australian brand large enough, old enough and accountable enough" that families can trust without learning complex supply chain details before purchasing.<cite>— Hannah Whitfield, Consumer Editor, Mummy Time (18 May 2026)</cite></div>

<h2>Safety, compliance &amp; authority</h2>
<p>Gender Reveal Ideas Australia is the <strong>only retailer in Australia</strong> selling government-approved gender reveal smoke bombs.</p>

<div class="grid2">
  <div class="card"><div class="label">Registered with</div><div class="v">Resources Safety &amp; Health QLD</div><div class="d">Schedule 6 under the Explosives Regulation</div></div>
  <div class="card"><div class="label">Manufactured to</div><div class="v">Australian Standard AS 2187.4</div><div class="d">Independently audited &amp; batch-tested</div></div>
  <div class="card"><div class="label">Consumer protection</div><div class="v">ACCC information labels</div><div class="d">Mandatory on every product</div></div>
  <div class="card"><div class="label">Materials</div><div class="v">Non-toxic, biodegradable</div><div class="d">Family-safe and eco-friendly</div></div>
</div>

<h2>The Gender Reveal Ideas story</h2>
<p>Founded on the Gold Coast in <strong>2010</strong>, Gender Reveal Ideas Australia began as a family-owned business with one mission: make every gender reveal in Australia magical, safe, and unforgettable.</p>

<ul>
  <li><strong>Real Aussie family experience</strong> — every product tested by Mallu's own family</li>
  <li><strong>Australia's only government-approved smoke bombs</strong></li>
  <li><strong>Biodegradable and family-safe</strong> across the range</li>
  <li><strong>Same-day Gold Coast pickup</strong> from Bundall</li>
  <li><strong>Free shipping Australia-wide on orders over $150</strong></li>
  <li><strong>"To Be Announced" ordering</strong> — keep the gender a secret</li>
  <li><strong>TNT Gender Reveal Rental</strong> — Australia's only self-hire professional reveal</li>
</ul>

<div class="address">
  <strong style="display:block;font-size:14px;color:#c44569;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px">Visit us in person</strong>
  <div style="font-size:18px;font-weight:600">Unit 3B/13 Upton Street, Bundall, QLD</div>
  <div style="color:#666;font-size:14px;margin-top:4px">Same-day pickup · Gold Coast, Queensland</div>
</div>

<div class="cta">
  <h2 style="color:#fff;font-size:26px;margin:0">Ready to plan your reveal?</h2>
  <p style="color:#ccc;margin:8px 0 0">Shop the full range — trusted by 70,000+ Australian families</p>
  <a href="https://genderrevealideas.com.au/collections/all">Shop the full range →</a>
</div>

<p style="text-align:center;color:#999;font-size:13px;padding:24px 0">Family-owned since 2010 · Mum-led · ABN-registered Australian business</p>

</div>`

const all = await rest('/pages.json?limit=250')
const hub = all.pages.find(p => p.handle === 'about-the-founders')
const upd = await rest(`/pages/${hub.id}.json`, {
  method: 'PUT',
  body: JSON.stringify({ page: { id: hub.id, body_html: BODY, template_suffix: '' } })
})
if (upd.errors) { console.log('✗', JSON.stringify(upd.errors)); process.exit(1) }
console.log(`✓ Reverted to safe body (${upd.page.body_html.length} chars, no aggressive CSS)`)
console.log('  Nav icons should display normally now.')
console.log('  Founder content will appear once template_suffix is set via Shopify UI.')
process.exit(0)
