/**
 * Fix #1: Force the founder page to display correctly via inline CSS override
 * Hides FAQ + newsletter sections that the default template injects
 * The page.content still renders our founder content — we just hide the noise
 */
import 'dotenv/config'
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'
async function rest(p,o={}){const r=await fetch(`${REST}${p}`,{...o,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(o.headers||{})}});return r.json()}

const TODAY = 'Tuesday, May 26, 2026'
const FOUNDER_IMG = 'https://cdn.shopify.com/s/files/1/0584/7410/2873/files/founder-mallu-campisi.png?v=1779842404'

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
      { "@type": "Person", "name": "Josh Campisi", "jobTitle": "Co-Founder", "description": "Co-Founder of Gender Reveal Ideas Australia.", "worksFor": { "@type": "Organization", "name": "Gender Reveal Ideas Australia", "url": "https://genderrevealideas.com.au" } }
    ]
  }
})}</script>
<script type="application/ld+json">${JSON.stringify({
  "@context":"https://schema.org","@type":"Person","name":"Mallu Campisi","jobTitle":"Co-Founder, Gender Reveal Ideas Australia","image":FOUNDER_IMG,"description":"Co-Founder of Australia's #1 gender reveal retailer. Mother of five, founded GRI in 2010.","sameAs":["https://www.instagram.com/mallucampisi/"],"worksFor":{"@type":"Organization","name":"Gender Reveal Ideas Australia","url":"https://genderrevealideas.com.au","foundingDate":"2010","address":{"@type":"PostalAddress","streetAddress":"Unit 3B/13 Upton Street","addressLocality":"Bundall","addressRegion":"QLD","addressCountry":"AU"}}
})}</script>`

// CSS-only kill switch — hides unwanted template sections on THIS page only
const KILL_CSS = `<style id="founders-page-override">
  /* Hide unwanted default sections (FAQ + newsletter) injected by the default template */
  body .shopify-section .collapsible-content-wrapper,
  body .shopify-section--collapsible-content,
  body .collapsible-content,
  body .collapsible-content-wrapper,
  body .shopify-section[class*="collapsible"],
  body .shopify-section[class*="newsletter"],
  body .newsletter-form__field-wrapper,
  body .newsletter,
  body section.newsletter,
  body div[class*="newsletter"]:has(form),
  body .multicolumn:has(.h0),
  body section:has(> .collapsible-content),
  body section:has(.faq) { display:none !important; }

  /* Reset any container padding/width restrictions that block our hero */
  body .rte > .founders-page,
  body .page-width--narrow:has(.founders-page),
  body .page-width:has(.founders-page) { max-width:none !important; width:100% !important; padding:0 !important; margin:0 auto !important }

  body .main-page-title { display:none !important }
  body .shopify-section--main-page { padding:0 !important }
</style>`

const HERO = `<style>
  .founders-page{font-family:'Helvetica Neue','Inter',system-ui,-apple-system,sans-serif;color:#1a1a1a;line-height:1.7;max-width:1200px;margin:0 auto;padding:0 24px}
  .fp-hero{padding:48px 0 36px;text-align:center;border-bottom:1px solid #f0e6e9}
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
  .fp-cta{text-align:center;padding:48px 24px;background:#1a1a1a;color:#fff;border-radius:18px;margin:48px 0}
  .fp-cta h2{color:#fff;font-size:32px;margin:0 0 12px}
  .fp-cta p{color:#ccc;margin:0 0 24px;font-size:17px}
  .fp-cta a.btn{display:inline-block;padding:16px 36px;background:#c44569;color:#fff;text-decoration:none;border-radius:100px;font-weight:600;font-size:16px;letter-spacing:0.3px}
  .fp-footer{text-align:center;color:#999;font-size:13px;padding:32px 0 48px;letter-spacing:0.3px}
</style>`

const BODY = `${KILL_CSS}${SCHEMA}${HERO}
<div class="founders-page">

  <div class="fp-hero">
    <span class="fp-eyebrow">Meet the Founders</span>
    <h1>The Aussie family behind <em>Australia's #1</em> gender reveal store</h1>
    <p class="lead">Family-owned. Mum-led. Gold Coast based. Trusted by 70,000+ Australian families since 2010.</p>
    <p class="fp-meta">Last updated: ${TODAY}</p>
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
        <img src="${FOUNDER_IMG}" alt="Mallu Campisi, Co-Founder of Gender Reveal Ideas Australia, pictured with her children" loading="eager">
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
    <p>From a family-run idea launched in 2010 to a national brand serving every Australian state and territory, Josh has helped build the systems — sourcing, compliance, fulfilment, customer service — that mean every Aussie mum gets a safe, on-time, photo-ready reveal experience.</p>
  </div>

  <div class="fp-section">
    <h2>Independent press &amp; verification</h2>
    <p>Gender Reveal Ideas Australia is the only Australian gender reveal retailer that has passed independent consumer-journalism compliance testing.</p>

    <div class="press-grid">
      <div class="press-card"><a href="https://mummytime.com.au/smokebombs" rel="noopener" target="_blank"><strong>Mummy Time · 12 May 2026</strong><span class="title">9 in 10 gender reveal smoke bombs sold to Aussie mums are illegal. Here's the 1 that isn't.</span></a></div>
      <div class="press-card"><a href="https://mummytime.com.au/genderrevealscam" rel="noopener" target="_blank"><strong>Mummy Time · 18 May 2026</strong><span class="title">The gender reveal scam Australian mums are quietly calling out in 2026</span></a></div>
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
      <div class="credential"><div class="label">Registered with</div><div class="value">Resources Safety &amp; Health Queensland</div><div class="detail">Schedule 6 supplier under the Explosives Regulation</div></div>
      <div class="credential"><div class="label">Manufactured to</div><div class="value">Australian Standard AS 2187.4</div><div class="detail">Independently audited, batch-tested before dispatch</div></div>
      <div class="credential"><div class="label">Consumer protection</div><div class="value">Mandatory ACCC information labels</div><div class="detail">Full disclosure on every product</div></div>
      <div class="credential"><div class="label">Materials</div><div class="value">Non-toxic, biodegradable</div><div class="detail">Family-safe and eco-friendly across the range</div></div>
    </div>
  </div>

  <div class="fp-section">
    <h2>The Gender Reveal Ideas story</h2>
    <p>Founded on the Gold Coast in <strong>2010</strong>, Gender Reveal Ideas Australia began as a family-owned business with one mission: make every gender reveal in Australia magical, safe, and unforgettable.</p>

    <h3>What makes GRI different</h3>
    <ul>
      <li><strong>Real Aussie family experience</strong> — every product is tested by Mallu's own family before it ships to yours</li>
      <li><strong>Australia's only government-approved smoke bombs</strong></li>
      <li><strong>Biodegradable and family-safe</strong> across the entire range</li>
      <li><strong>Same-day Gold Coast pickup</strong> from Unit 3B/13 Upton Street, Bundall</li>
      <li><strong>Free shipping Australia-wide on orders over $150</strong></li>
      <li><strong>"To Be Announced" ordering</strong> — keep the gender a secret from the mum-to-be</li>
      <li><strong>TNT Gender Reveal Rental</strong> — Australia's only self-hire professional reveal</li>
    </ul>

    <div class="address-block">
      <strong style="display:block;color:#1a1a1a;font-size:16px;margin-bottom:6px;letter-spacing:0.3px">Visit us in person</strong>
      <div style="font-size:18px;color:#333;margin:6px 0">Unit 3B/13 Upton Street, Bundall, QLD</div>
      <div style="color:#666;font-size:14px;margin-top:6px">Same-day pickup available · Gold Coast, Queensland</div>
    </div>
  </div>

  <div class="fp-cta">
    <h2>Ready to plan your reveal?</h2>
    <p>Shop the full Gender Reveal Ideas range — trusted by 70,000+ Australian families.</p>
    <a href="https://genderrevealideas.com.au/collections/all" class="btn">Shop the full range →</a>
  </div>

  <p class="fp-footer">Family-owned since 2010 · Mum-led · ABN-registered Australian business · Last updated: ${TODAY}</p>

</div>`

// Reset template to null (use default page.json) — since our CSS will hide the unwanted sections
const all = await rest('/pages.json?limit=250')
const hub = all.pages.find(p => p.handle === 'about-the-founders')
const upd = await rest(`/pages/${hub.id}.json`, {
  method: 'PUT',
  body: JSON.stringify({ page: { id: hub.id, body_html: BODY, template_suffix: '' } })
})
if (upd.errors) { console.log('✗', JSON.stringify(upd.errors)); process.exit(1) }
console.log(`✓ Founder page updated (body: ${upd.page.body_html.length} chars, template: default)`)
console.log('  CSS override hides FAQ + newsletter sections, our content displays cleanly')
process.exit(0)
