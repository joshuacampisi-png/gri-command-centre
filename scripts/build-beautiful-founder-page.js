/**
 * 1. Create templates/page.founders.json (clean, ONLY renders page.content)
 * 2. Push beautiful magazine-style body_html with Mallu's photo
 * 3. Apply template_suffix: founders
 * 4. Verify HTTP 200 + content visible
 *
 * Risk profile: brand new template (no overwrite), scoped to ONE page, fully reversible
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}
const sleep = ms => new Promise(r=>setTimeout(r,ms))

const TODAY_DISPLAY = 'Tuesday, May 26, 2026'
const FOUNDER_IMG = 'https://cdn.shopify.com/s/files/1/0584/7410/2873/files/founder-mallu-campisi.png?v=1779842404'

// ============== STEP 1: CREATE CLEAN TEMPLATE ==============
console.log('=== STEP 1: Creating templates/page.founders.json ===\n')
const themes = await rest('/themes.json')
const main = themes.themes.find(t => t.role === 'main')
const TEMPLATE = {
  "sections": {
    "main": {
      "type": "main-page",
      "settings": {}
    }
  },
  "order": ["main"]
}
const tmplUp = await rest(`/themes/${main.id}/assets.json`, {
  method: 'PUT',
  body: JSON.stringify({
    asset: { key: 'templates/page.founders.json', value: JSON.stringify(TEMPLATE, null, 2) }
  })
})
if (tmplUp.errors) { console.log('✗', JSON.stringify(tmplUp.errors)); process.exit(1) }
console.log('✓ Template file created (renders page.content only — no FAQs, no contact form)\n')

// ============== STEP 2: BUILD BEAUTIFUL BODY ==============
const SCHEMA = `<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "AboutPage",
  "url": "https://genderrevealideas.com.au/pages/about-the-founders",
  "name": "About the Founders — Gender Reveal Ideas Australia",
  "mainEntity": {
    "@type": "Organization",
    "name": "Gender Reveal Ideas Australia",
    "foundingDate": "2010",
    "founder": [
      { "@type": "Person", "name": "Mallu Campisi", "jobTitle": "Co-Founder", "description": "Co-Founder of Gender Reveal Ideas Australia. Mother of five who built Australia's #1 gender reveal store from a passion for celebrating life and motherhood.", "image": FOUNDER_IMG, "sameAs": ["https://www.instagram.com/mallucampisi/"], "worksFor": { "@type": "Organization", "name": "Gender Reveal Ideas Australia", "url": "https://genderrevealideas.com.au" }, "knowsAbout": ["Gender reveal parties","Motherhood","Family celebrations","Pregnancy announcements","Australian baby products"] },
      { "@type": "Person", "name": "Josh Campisi", "jobTitle": "Co-Founder", "description": "Co-Founder of Gender Reveal Ideas Australia. Co-built Australia's #1 gender reveal store alongside Mallu, helping over 70,000 Australian families celebrate baby announcements.", "worksFor": { "@type": "Organization", "name": "Gender Reveal Ideas Australia", "url": "https://genderrevealideas.com.au" } }
    ]
  }
})}</script>
<script type="application/ld+json">${JSON.stringify({
  "@context":"https://schema.org","@type":"Person","name":"Mallu Campisi","jobTitle":"Co-Founder, Gender Reveal Ideas Australia","image":FOUNDER_IMG,"description":"Co-Founder of Australia's #1 gender reveal retailer. Mother of five and the creative force behind Gender Reveal Ideas Australia, founded in 2010.","sameAs":["https://www.instagram.com/mallucampisi/"],"worksFor":{"@type":"Organization","name":"Gender Reveal Ideas Australia","url":"https://genderrevealideas.com.au","foundingDate":"2010","address":{"@type":"PostalAddress","streetAddress":"Unit 3B/13 Upton Street","addressLocality":"Bundall","addressRegion":"QLD","addressCountry":"AU"}},"knowsAbout":["Gender reveal parties","Motherhood","Family celebrations","Pregnancy announcements"]
})}</script>`

const BODY = `${SCHEMA}
<style>
  .founders-page{font-family:'Helvetica Neue','Inter',system-ui,-apple-system,sans-serif;color:#1a1a1a;line-height:1.7;max-width:1200px;margin:0 auto;padding:0 24px}
  .fp-hero{padding:64px 0 48px;text-align:center;border-bottom:1px solid #f0e6e9}
  .fp-eyebrow{display:inline-block;padding:6px 14px;background:#fff7f9;color:#c44569;border-radius:100px;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:600;margin-bottom:18px}
  .fp-hero h1{font-size:clamp(34px,5vw,56px);line-height:1.08;margin:0 0 16px;font-weight:700;letter-spacing:-0.02em;color:#1a1a1a}
  .fp-hero h1 em{font-style:italic;color:#c44569;font-weight:400}
  .fp-hero p.lead{font-size:clamp(17px,2vw,21px);color:#555;max-width:720px;margin:0 auto 18px;line-height:1.5}
  .fp-meta{color:#999;font-size:13px;letter-spacing:0.5px}

  .fp-trust-strip{display:flex;justify-content:center;align-items:center;gap:32px;flex-wrap:wrap;padding:24px 20px;background:#fff7f9;border-radius:14px;margin:32px 0 48px;font-size:14px;color:#555}
  .fp-trust-strip span{display:flex;align-items:center;gap:8px;white-space:nowrap}
  .fp-trust-strip strong{color:#c44569}
  .fp-stars{color:#ffa500;letter-spacing:2px;font-size:16px}

  .fp-section{padding:56px 0;border-bottom:1px solid #f5eaee}
  .fp-section:last-child{border-bottom:none}
  .fp-section h2{font-size:clamp(26px,3.5vw,38px);line-height:1.15;margin:0 0 24px;font-weight:700;letter-spacing:-0.01em;color:#1a1a1a}
  .fp-section h3{font-size:22px;margin:32px 0 12px;font-weight:600;color:#1a1a1a}
  .fp-section p{font-size:17px;line-height:1.75;margin:14px 0;color:#333}
  .fp-section ul{font-size:16px;line-height:1.9;padding-left:0;list-style:none;margin:18px 0}
  .fp-section ul li{padding-left:28px;position:relative;margin:8px 0}
  .fp-section ul li::before{content:'✓';position:absolute;left:0;top:0;color:#c44569;font-weight:700}
  .fp-section a{color:#c44569;text-decoration:underline}
  .fp-section a:hover{color:#9b3753}

  .founder-block{display:grid;grid-template-columns:1fr;gap:32px;align-items:start;margin:24px 0}
  @media(min-width:768px){.founder-block{grid-template-columns:420px 1fr;gap:48px}}
  .founder-photo{position:relative;border-radius:18px;overflow:hidden;box-shadow:0 20px 60px -20px rgba(196,69,105,0.25)}
  .founder-photo img{display:block;width:100%;height:auto}
  .founder-photo .photo-tag{position:absolute;bottom:14px;left:14px;background:rgba(255,255,255,0.95);padding:8px 14px;border-radius:100px;font-size:12px;font-weight:600;color:#c44569;letter-spacing:0.5px}

  .pullquote{font-size:24px;font-style:italic;color:#1a1a1a;border-left:4px solid #c44569;padding:18px 28px;margin:32px 0;line-height:1.4;background:#fff7f9;border-radius:0 14px 14px 0}
  .pullquote cite{display:block;font-size:14px;font-style:normal;color:#666;margin-top:12px;letter-spacing:0.5px}

  .press-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin:24px 0}
  @media(min-width:768px){.press-grid{grid-template-columns:repeat(3,1fr)}}
  .press-card{padding:18px;background:#fafafa;border:1px solid #eee;border-radius:12px;text-align:center;transition:all 0.2s}
  .press-card:hover{border-color:#c44569;transform:translateY(-2px)}
  .press-card strong{display:block;font-size:13px;color:#c44569;letter-spacing:1px;margin-bottom:8px;text-transform:uppercase}
  .press-card .title{font-size:14px;color:#333;line-height:1.4;font-weight:500}
  .press-card a{color:#1a1a1a;text-decoration:none}

  .credentials-grid{display:grid;grid-template-columns:1fr;gap:20px;margin:24px 0}
  @media(min-width:768px){.credentials-grid{grid-template-columns:repeat(2,1fr)}}
  .credential{padding:24px;background:#fdfdfd;border:1px solid #f0e6e9;border-radius:14px}
  .credential .label{font-size:11px;color:#c44569;letter-spacing:2px;font-weight:700;text-transform:uppercase;margin-bottom:10px}
  .credential .value{font-size:18px;color:#1a1a1a;font-weight:600;line-height:1.4}
  .credential .detail{font-size:14px;color:#666;margin-top:6px;line-height:1.5}

  .address-block{background:linear-gradient(135deg,#fff7f9 0%,#fdfdfd 100%);padding:32px;border-radius:18px;margin:32px 0;text-align:center}
  .address-block strong{display:block;color:#1a1a1a;font-size:16px;margin-bottom:6px;letter-spacing:0.3px}
  .address-block .address{font-size:18px;color:#333;margin:6px 0}

  .fp-cta{text-align:center;padding:48px 24px;background:#1a1a1a;color:#fff;border-radius:18px;margin:48px 0}
  .fp-cta h2{color:#fff;font-size:32px;margin:0 0 12px}
  .fp-cta p{color:#ccc;margin:0 0 24px;font-size:17px}
  .fp-cta a.btn{display:inline-block;padding:16px 36px;background:#c44569;color:#fff;text-decoration:none;border-radius:100px;font-weight:600;font-size:16px;letter-spacing:0.3px}
  .fp-cta a.btn:hover{background:#9b3753}

  .fp-footer{text-align:center;color:#999;font-size:13px;padding:32px 0 48px;letter-spacing:0.3px}
</style>

<div class="founders-page">

  <div class="fp-hero">
    <span class="fp-eyebrow">Meet the Founders</span>
    <h1>The Aussie family behind <em>Australia's #1</em> gender reveal store</h1>
    <p class="lead">Family-owned. Mum-led. Gold Coast based. Trusted by 70,000+ Australian families since 2010.</p>
    <p class="fp-meta">Last updated: ${TODAY_DISPLAY}</p>
  </div>

  <div class="fp-trust-strip">
    <span><span class="fp-stars">★★★★★</span> <strong>4.85/5</strong> from 1,740+ reviews</span>
    <span><strong>600,000+</strong> units shipped past 12 months</span>
    <span><strong>Family owned</strong> since 2010</span>
    <span>📍 <strong>Gold Coast HQ</strong></span>
  </div>

  <div class="fp-section">
    <span class="fp-eyebrow">Co-Founder</span>
    <h2>Mallu Campisi</h2>
    <p style="font-size:17px;color:#666;margin:-12px 0 24px">Mother of five · <a href="https://www.instagram.com/mallucampisi/" rel="noopener" target="_blank">@mallucampisi</a></p>

    <div class="founder-block">
      <div class="founder-photo">
        <img src="${FOUNDER_IMG}" alt="Mallu Campisi, Co-Founder of Gender Reveal Ideas Australia, pictured with her five children" loading="eager">
        <span class="photo-tag">Mallu + the family</span>
      </div>
      <div>
        <p>Mallu Campisi is the heart of Gender Reveal Ideas Australia. A devoted mother of five and one of Australia's most-followed mum creators on Instagram (<a href="https://www.instagram.com/mallucampisi/" rel="noopener" target="_blank">@mallucampisi</a>), Mallu founded GRI in <strong>2010</strong> from a simple belief: <em>every Australian family deserves a magical, safe, and unforgettable way to celebrate the moment they meet their baby's gender.</em></p>

        <p>What started as one Aussie mum with a love for celebrating life has grown into Australia's #1 gender reveal retailer — shipping <strong>600,000+ units</strong> in the past 12 months alone to families in every state and territory.</p>

        <div class="pullquote">
          "Every product we sell is one I'd give to my own daughters or sisters. If it's not safe enough for my family, it doesn't make it to yours."
          <cite>— Mallu Campisi, Co-Founder</cite>
        </div>

        <p>Mallu's passion for motherhood and family celebration shapes every product Gender Reveal Ideas sells. From the first bio-cannon shipped in 2010 to today's range of government-approved smoke bombs, every product is chosen, tested, and lived through Mallu's own family experiences.</p>
      </div>
    </div>
  </div>

  <div class="fp-section">
    <span class="fp-eyebrow">Co-Founder</span>
    <h2>Josh Campisi</h2>

    <p>Co-Founder Josh Campisi works alongside Mallu to scale Gender Reveal Ideas Australia into the country's #1 gender reveal retailer. Operations, supply chain, regulatory compliance, and the launch of the unique <a href="https://genderrevealideas.com.au/products/tnt-gender-reveal-australia">TNT Self-Hire Rental</a> (Australia's only professional-grade gender reveal rental experience) all sit under his leadership.</p>

    <p>From a family-run idea launched in 2010 to a national brand serving every Australian state and territory, Josh has helped build the systems — sourcing, compliance, fulfilment, customer service — that mean every Aussie mum, dad, family member, and friend gets a safe, on-time, photo-ready reveal experience.</p>
  </div>

  <div class="fp-section">
    <h2>Independent press &amp; verification</h2>
    <p>Gender Reveal Ideas Australia is the only Australian gender reveal retailer that has passed independent consumer-journalism compliance testing.</p>

    <div class="press-grid">
      <div class="press-card">
        <a href="https://mummytime.com.au/smokebombs" rel="noopener" target="_blank">
          <strong>Mummy Time · 12 May 2026</strong>
          <span class="title">9 in 10 gender reveal smoke bombs sold to Aussie mums are illegal. Here's the 1 that isn't.</span>
        </a>
      </div>
      <div class="press-card">
        <a href="https://mummytime.com.au/genderrevealscam" rel="noopener" target="_blank">
          <strong>Mummy Time · 18 May 2026</strong>
          <span class="title">The gender reveal scam Australian mums are quietly calling out in 2026</span>
        </a>
      </div>
      <div class="press-card"><strong>ABC</strong><span class="title">Featured</span></div>
      <div class="press-card"><strong>Channel 9 · Weekend Sunrise</strong><span class="title">Featured</span></div>
      <div class="press-card"><strong>Sea FM</strong><span class="title">Featured</span></div>
      <div class="press-card"><strong>Gold Coast Bulletin</strong><span class="title">Featured</span></div>
    </div>

    <div class="pullquote">
      Gender Reveal Ideas is "the one Australian brand large enough, old enough and accountable enough that you do not have to" learn complex supply chain details before purchasing.
      <cite>— Hannah Whitfield, Consumer Editor, Mummy Time (18 May 2026)</cite>
    </div>
  </div>

  <div class="fp-section">
    <h2>Safety, compliance &amp; authority</h2>
    <p>Gender Reveal Ideas Australia is the <strong>only retailer in Australia</strong> selling government-approved gender reveal smoke bombs. Our compliance credentials:</p>

    <div class="credentials-grid">
      <div class="credential">
        <div class="label">Registered with</div>
        <div class="value">Resources Safety &amp; Health Queensland</div>
        <div class="detail">Schedule 6 supplier under the Explosives Regulation</div>
      </div>
      <div class="credential">
        <div class="label">Manufactured to</div>
        <div class="value">Australian Standard AS 2187.4</div>
        <div class="detail">Independently audited, batch-tested before dispatch</div>
      </div>
      <div class="credential">
        <div class="label">Consumer protection</div>
        <div class="value">Mandatory ACCC information labels</div>
        <div class="detail">Full disclosure on every product</div>
      </div>
      <div class="credential">
        <div class="label">Materials</div>
        <div class="value">Non-toxic, biodegradable</div>
        <div class="detail">Family-safe and eco-friendly across the range</div>
      </div>
    </div>
  </div>

  <div class="fp-section">
    <h2>The Gender Reveal Ideas story</h2>

    <p>Founded on the Gold Coast in <strong>2010</strong>, Gender Reveal Ideas Australia began as a family-owned business with one mission: make every gender reveal in Australia magical, safe, and unforgettable.</p>

    <h3>What makes GRI different</h3>
    <ul>
      <li><strong>Real Aussie family experience</strong> — every product is tested by Mallu's own family before it ships to yours</li>
      <li><strong>Australia's only government-approved smoke bombs</strong> — registered with Resources Safety &amp; Health Queensland (Schedule 6, AS 2187.4)</li>
      <li><strong>Biodegradable and family-safe across the entire product range</strong></li>
      <li><strong>Same-day Gold Coast pickup</strong> available from Unit 3B/13 Upton Street, Bundall</li>
      <li><strong>Free shipping Australia-wide on orders over $150</strong></li>
      <li><strong>"To Be Announced" ordering</strong> — keep the gender a secret from the mum-to-be (or the dad)</li>
      <li><strong>TNT Gender Reveal Rental</strong> — Australia's only professional-grade self-hire reveal</li>
    </ul>

    <div class="address-block">
      <strong>Visit us in person</strong>
      <div class="address">Unit 3B/13 Upton Street, Bundall, QLD</div>
      <div style="color:#666;font-size:14px;margin-top:6px">Same-day pickup available · Gold Coast, Queensland</div>
    </div>
  </div>

  <div class="fp-cta">
    <h2>Ready to plan your reveal?</h2>
    <p>Shop the full Gender Reveal Ideas range — trusted by 70,000+ Australian families.</p>
    <a href="https://genderrevealideas.com.au/collections/all" class="btn">Shop the full range →</a>
  </div>

  <p class="fp-footer">Family-owned since 2010 · Mum-led · ABN-registered Australian business · Last updated: ${TODAY_DISPLAY}</p>

</div>`

console.log('=== STEP 2: Updating page body_html with beautiful design ===\n')
const allPages = await rest('/pages.json?limit=250')
const hub = allPages.pages.find(p => p.handle === 'about-the-founders')
await sleep(500)
const bodyUpd = await rest(`/pages/${hub.id}.json`, {
  method: 'PUT',
  body: JSON.stringify({ page: { id: hub.id, body_html: BODY, template_suffix: 'founders' } })
})
if (bodyUpd.errors) { console.log('✗', JSON.stringify(bodyUpd.errors)); process.exit(1) }
console.log(`✓ Updated. Body: ${bodyUpd.page.body_html.length} chars. Template: ${bodyUpd.page.template_suffix}`)

console.log('\n=== HTTP VERIFICATION ===')
await sleep(2000)
const r = await fetch('https://genderrevealideas.com.au/pages/about-the-founders')
console.log(`Status: ${r.status}`)
const html = await r.text()
console.log(`HTML length: ${html.length} chars`)
console.log(`Contains "Mallu Campisi": ${html.includes('Mallu Campisi') ? '✓' : '✗'}`)
console.log(`Contains "Co-Founder": ${html.includes('Co-Founder') ? '✓' : '✗'}`)
console.log(`Contains founder image URL: ${html.includes('founder-mallu-campisi') ? '✓' : '✗'}`)
console.log(`Contains FAQ override: ${html.includes('GENDER REVEAL IDEAS FAQ') ? '⚠ FAQ STILL THERE' : '✓ no FAQ'}`)

console.log('\n✓ DONE — Verify visually: https://genderrevealideas.com.au/pages/about-the-founders')
process.exit(0)
