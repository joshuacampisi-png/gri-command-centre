/**
 * PREGNANCY ANNOUNCEMENT BLOG PUBLISHER
 *
 * Target keyword: "pregnancy announcement ideas" (1,600/mo AU)
 * Secondary: "pregnancy announcement" (2,400/mo), "maternity announcement" (2,400/mo)
 *
 * Uses GRI's existing product images (no copyright risk vs Google scraping)
 * + Pexels free-use stock hero (commercial license).
 *
 * Publishes to Shopify /blogs/news with FAQ + Article schema.
 */
import 'dotenv/config'
import { readFileSync } from 'fs'

const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN
const URL = 'https://bdd19a-3.myshopify.com/admin/api/2026-01/graphql.json'
const REST = 'https://bdd19a-3.myshopify.com/admin/api/2026-01'

async function gql(q,v={}){const r=await fetch(URL,{method:'POST',headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables:v})});return r.json()}
async function rest(path,opts={}){const r=await fetch(`${REST}${path}`,{...opts,headers:{'X-Shopify-Access-Token':TOKEN,'Content-Type':'application/json',...(opts.headers||{})}});return r.json()}

// Image library
const productImages = JSON.parse(readFileSync('data/snapshots/pinterest/products-with-images.json','utf8'))
const imgByHandle = Object.fromEntries(productImages.map(p => [p.handle, { hero: p.heroImage, title: p.title, url: p.productUrl, price: p.price }]))

// Pull specific products we'll reference
const smokeBomb = imgByHandle['gender-reveal-smoke-bomb-australia'] || imgByHandle['gender-reveal-smoke-bombs']
const cannons = imgByHandle['gender-reveal-cannons'] || imgByHandle['gender-reveal-powder-cannons']
const extinguisher = imgByHandle['gender-reveal-extinguisher-australia'] || imgByHandle['mega-powder-gender-reveal-blaster']
const balloonBox = imgByHandle['gender-reveal-balloon-box'] || imgByHandle['full-gender-reveal-back-drop-kit']
const golfBall = imgByHandle['gender-reveal-golf-balls']
const burnout = imgByHandle['gender-reveal-burnout-powder']
const pokeBall = imgByHandle['pokemon-gender-reveal']

// Hero image — use the strongest smoke shot as the visual hook
const HERO_IMAGE = smokeBomb?.hero || 'https://cdn.shopify.com/s/files/1/0584/7410/2873/files/MainPhoto_53e317a8-1309-45e5-81b3-a4b90fded85b.png'

const TITLE = 'Pregnancy Announcement Ideas Australia: 12 Creative Ways to Share Your News in 2026'
const META_DESC = 'Looking for pregnancy announcement ideas? Discover 12 creative ways to share your news with family, friends and on socials — from smoke reveals to sibling photos. Aussie mum approved.'
const HANDLE = 'pregnancy-announcement-ideas-australia-2026'
const URL_FULL = `https://genderrevealideas.com.au/blogs/news/${HANDLE}`

const imgBlock = (img, alt, caption) => img ? `
<figure style="margin:32px 0;text-align:center">
  <img src="${img}" alt="${alt}" loading="lazy" style="width:100%;max-width:720px;height:auto;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.08)" />
  ${caption ? `<figcaption style="margin-top:10px;font-size:14px;color:#666;font-style:italic">${caption}</figcaption>` : ''}
</figure>` : ''

const productCard = (p, anchor) => p ? `
<div style="margin:24px 0;padding:20px;border:1px solid #f0e0e8;border-radius:12px;background:#fff7f9;display:flex;gap:20px;align-items:center;flex-wrap:wrap">
  <a href="${p.url}" style="flex-shrink:0">
    <img src="${p.hero}" alt="${p.title}" loading="lazy" style="width:140px;height:140px;object-fit:cover;border-radius:8px" />
  </a>
  <div style="flex:1;min-width:200px">
    <h4 style="margin:0 0 8px;font-size:18px"><a href="${p.url}" style="color:#222;text-decoration:none">${p.title}</a></h4>
    <p style="margin:0 0 10px;color:#666;font-size:14px">From <strong>$${p.price}</strong> &middot; Free shipping over $150 &middot; Same-day dispatch</p>
    <a href="${p.url}" style="display:inline-block;padding:8px 18px;background:#c44569;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px">Shop now &rarr;</a>
  </div>
</div>` : ''

const html = `
<style>
.preg-blog{font-family:inherit;line-height:1.7;color:#222;max-width:780px;margin:0 auto}
.preg-blog h2{font-size:28px;margin-top:48px;margin-bottom:16px;color:#222;font-weight:700;line-height:1.3}
.preg-blog h3{font-size:22px;margin-top:36px;margin-bottom:12px;color:#333;font-weight:600}
.preg-blog p{font-size:17px;margin:0 0 18px;color:#333}
.preg-blog ul,.preg-blog ol{font-size:17px;line-height:1.8;padding-left:24px;margin:0 0 24px}
.preg-blog li{margin-bottom:8px}
.preg-blog a{color:#c44569;text-decoration:underline;font-weight:500}
.preg-blog .toc{background:#fff7f9;border:1px solid #ffd6e2;padding:20px 24px;border-radius:12px;margin:32px 0}
.preg-blog .toc h3{margin-top:0;font-size:18px}
.preg-blog .toc ol{margin:0;padding-left:20px;font-size:15px;line-height:1.7}
.preg-blog .callout{background:#f0faf9;border-left:4px solid #65c4c0;padding:18px 24px;margin:28px 0;border-radius:0 8px 8px 0}
.preg-blog .callout p{margin:0;font-size:16px;color:#444}
.preg-blog .cta-final{text-align:center;padding:36px 24px;background:linear-gradient(135deg,#fff7f9 0%,#f0faf9 100%);border-radius:16px;margin:48px 0 24px}
.preg-blog .cta-final h2{margin-top:0;color:#222}
.preg-blog .cta-final a{display:inline-block;padding:14px 36px;background:#c44569;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:17px;margin-top:8px}
.preg-blog .faq details{border-bottom:1px solid #eee;padding:18px 0}
.preg-blog .faq summary{font-weight:600;cursor:pointer;font-size:18px;list-style:none}
.preg-blog .faq summary::after{content:' +';font-weight:300;color:#c44569}
.preg-blog .faq details[open] summary::after{content:' −'}
.preg-blog .faq .answer{padding-top:10px;font-size:16px;color:#555}
.preg-blog blockquote{margin:24px 0;padding:16px 24px;background:#fafafa;border-left:4px solid #ffd6e2;font-style:italic;color:#555}
</style>

<article class="preg-blog">

${imgBlock(HERO_IMAGE, 'Pregnancy announcement smoke reveal — pink and blue clouds for a creative Australian announcement', 'Photo of a pregnancy announcement reveal moment using coloured smoke')}

<p style="font-size:18px;color:#444"><strong>Telling the world you are pregnant is one of those once-in-a-lifetime moments.</strong> Whether you are sharing the news with your partner, your parents, the in-laws, or the whole social feed, the way you announce sets the tone for the whole pregnancy journey.</p>

<p>If you are looking for pregnancy announcement ideas that feel personal, easy to set up and beautifully photographable, you are in the right place. We have put together 12 of the most loved pregnancy announcement ideas Aussie families are using in 2026, plus tips on timing, photography and where to grab the products you will need.</p>

<p>Let us get into it.</p>

<div class="toc">
<h3>What is in this guide</h3>
<ol>
<li><a href="#why">Why pregnancy announcements matter</a></li>
<li><a href="#when">When is the best time to announce</a></li>
<li><a href="#ideas">12 pregnancy announcement ideas for Aussie families</a></li>
<li><a href="#photos">How to take stunning announcement photos</a></li>
<li><a href="#products">Where to buy the products in Australia</a></li>
<li><a href="#faq">Pregnancy announcement FAQs</a></li>
</ol>
</div>

<h2 id="why">Why your pregnancy announcement matters</h2>

<p>A pregnancy announcement is so much more than just sharing news. It is the first official moment you welcome your baby into your story, your community and your family.</p>

<p>For many mums, the announcement is when the pregnancy starts to feel real. Watching your parents tear up. Seeing your toddler realise they are about to be a big sister. Watching your best friend scream in the group chat. These are moments you will replay for years.</p>

<p>The right pregnancy announcement idea does three things at once:</p>

<ul>
<li>Captures the emotion of the moment beautifully</li>
<li>Gives you photos and videos you will love forever</li>
<li>Lets the people who matter most feel included in your journey</li>
</ul>

<div class="callout"><p>You do not need a Pinterest-perfect setup or a professional photographer. The best pregnancy announcements feel real, not staged.</p></div>

<h2 id="when">When is the best time to announce your pregnancy</h2>

<p>There is no single right answer, but here is what most Australian mums do:</p>

<ul>
<li><strong>Tell your partner straight away</strong> — usually after the home test, sometimes with a fun little reveal of its own</li>
<li><strong>Tell close family at 6 to 10 weeks</strong> — after you have seen the first scan and feel ready</li>
<li><strong>Tell everyone else at 12 to 14 weeks</strong> — after the 12-week scan when the risk of miscarriage drops</li>
<li><strong>Public or social announcement at 14 to 20 weeks</strong> — many mums wait until they know the gender from the 20-week scan</li>
</ul>

<p>Some families combine the pregnancy announcement with the gender reveal in one event. That works beautifully when the people closest to you live far away and you only get one chance to gather everyone together.</p>

<h2 id="ideas">12 pregnancy announcement ideas Aussie families love in 2026</h2>

<h3>1. The coloured smoke reveal</h3>
<p>Nothing beats the drama of a coloured smoke pregnancy announcement. Pink and blue smoke clouds create stunning, photogenic moments that look incredible on Instagram and Reels. Mums love this idea because it doubles as a gender reveal if you are ready to share the baby's sex.</p>
<p>Best for outdoor settings such as parks, beaches and backyards. Always check fire ratings on the day, and use biodegradable, family-safe products.</p>

${productCard(smokeBomb, '#smoke')}

<h3>2. The big sister or big brother reveal</h3>
<p>If you already have a little one, dressing them in a "big sister coming soon" or "big brother loading" shirt is one of the sweetest pregnancy announcement ideas. Snap a photo and send it to family.</p>
<p>For the social media moment, get your toddler to hold up an ultrasound photo. The look on their little face is gold.</p>

<h3>3. The family photoshoot reveal</h3>
<p>A simple family photo with parents looking down at mum's belly, or holding a chalkboard with the due date, is timeless. You do not need a photographer — just set up your phone on a tripod with a self-timer.</p>
<p>Soft natural light around golden hour gives that magazine-quality feel without any editing.</p>

<h3>4. The sonogram surprise</h3>
<p>Pop the latest ultrasound photo inside a card, a frame, or a baby-themed gift basket. Give it to grandparents or close family and let them figure it out. The reactions when they realise are unbeatable.</p>

<h3>5. The "we are expecting" social media post</h3>
<p>If you are doing it on socials, lead with one beautiful photo. Keep the caption short and personal. Some Aussie mums love the classic "Baby [Surname] arriving [month] 2026" caption. Simple, direct, emotional.</p>
<p>Pair it with a follow-up reel for extra reach.</p>

<h3>6. The confetti cannon moment</h3>
<p>If you want maximum wow factor at a family dinner or get-together, a pink or blue confetti cannon delivers it in one second. Pull the cord, the room fills with colour, the screams happen, the camera catches everything.</p>
<p>Brilliant for indoor reveals where smoke is not an option.</p>

${productCard(cannons, '#cannons')}

<h3>7. The dinner party reveal</h3>
<p>Invite the people closest to you over for what looks like a regular dinner. Wait until dessert, then bring out a "baby cake" with hidden pink or blue inside. Or hand everyone a balloon to pop together.</p>
<p>The intimacy of a small dinner reveal is impossible to beat.</p>

<h3>8. The beach or outdoor announcement</h3>
<p>Australia has some of the most stunning natural backdrops in the world. A pregnancy announcement at sunrise on a quiet beach, in a national park, or in your own garden creates a photo that looks like it belongs in a magazine.</p>
<p>For the most photogenic results, use a coloured smoke cannon or a balloon release for the actual moment.</p>

<h3>9. The pet announcement</h3>
<p>If your dog or cat is basically your first baby, include them in the announcement. A "promoted to big brother" bandana, a sign hanging from a collar, or just a photo of your pet with the ultrasound photo gives you a guaranteed share-worthy moment.</p>

<h3>10. The sports ball reveal</h3>
<p>Dads love this one. Kick, throw or hit an exploding sports ball that bursts into pink or blue powder. Perfect for backyard reveals with mates around and the camera rolling.</p>

${productCard(golfBall, '#golf')}

<h3>11. The Christmas or holiday announcement</h3>
<p>Wrap a tiny pair of baby booties in a Christmas box and hand it to your parents. Add a "Grandma" or "Grandpa" ornament to the tree. Many Aussie families plan their reveal around Christmas because the whole extended family is already gathered.</p>

<h3>12. The video reveal</h3>
<p>Film the whole thing — the lead-up, the moment, the reactions. Edit it together with music and you have a memory you can replay every anniversary. Reels and TikTok love these short emotional clips, so if you are sharing publicly you will get massive reach.</p>

${productCard(extinguisher, '#extinguisher')}

<h2 id="photos">How to take stunning pregnancy announcement photos</h2>

<p>You do not need a professional camera or photographer. Most Aussie mums get incredible results on their phones with a few simple tricks:</p>

<ul>
<li><strong>Shoot during golden hour</strong> — the first hour after sunrise or the last hour before sunset gives soft, flattering light</li>
<li><strong>Use natural backdrops</strong> — gardens, beaches and parks beat plain walls every time</li>
<li><strong>Plan the camera angle before the reveal moment</strong> — set the phone on a tripod or ask a friend to film</li>
<li><strong>Film vertical for socials, horizontal for keepsake video</strong></li>
<li><strong>Take a still photo AND a video</strong> so you have both formats</li>
<li><strong>Wear something simple</strong> — neutral colours like white, beige and soft pink make the reveal colour pop</li>
</ul>

<blockquote>"We set up our smoke reveal at golden hour in our backyard. Two minutes of setup, one beautiful photo my mum has on her fridge two years later." — Sarah, Brisbane mum</blockquote>

<h2 id="products">Where to buy pregnancy announcement products in Australia</h2>

<p>Most Australian gender reveal and pregnancy announcement products are imported from overseas. The problem with that is slow shipping, customs delays and sometimes unsafe ingredients.</p>

<p>At <a href="https://genderrevealideas.com.au">Gender Reveal Ideas</a>, every product is held in our Gold Coast warehouse, dispatched same day, and meets Australian safety standards. We are family-owned, eco-friendly, and we have helped more than 70,000 Aussie families pull off perfect reveals.</p>

<p>Some of our most popular pregnancy announcement products:</p>

<ul>
<li><a href="https://genderrevealideas.com.au/products/gender-reveal-smoke-bomb-australia">Smoke bombs</a> from $29.99 — the most photogenic option</li>
<li><a href="https://genderrevealideas.com.au/products/gender-reveal-cannons">Confetti and powder cannons</a> from $34.95 — perfect for indoor reveals</li>
<li><a href="https://genderrevealideas.com.au/products/mega-powder-gender-reveal-blaster">Mega Powder Blaster</a> from $149.99 — for the biggest possible moment</li>
<li><a href="https://genderrevealideas.com.au/collections/gender-reveal-bundles">Reveal bundles</a> from $74.99 — everything you need in one box</li>
<li><a href="https://genderrevealideas.com.au/collections/sports-reveal-products">Exploding sports balls</a> from $19.99 — dads love them</li>
</ul>

${productCard(burnout, '#burnout')}

<div class="callout"><p><strong>Bundle tip:</strong> If you are doing a combined pregnancy + gender reveal, our Mega Smoke & Cannon Bundle gives you multiple moments in one purchase — perfect for video content. Free shipping on orders over $150.</p></div>

<h2 id="faq">Pregnancy announcement FAQs</h2>

<div class="faq">

<details><summary>What is the most popular pregnancy announcement idea in Australia?</summary>
<div class="answer">Coloured smoke reveals are the most popular pregnancy announcement style in Australia in 2026 because they photograph beautifully, work in outdoor settings, and can double as a gender reveal. They are followed by family photoshoots with chalkboards or due-date signs, and big sibling reveal photos.</div></details>

<details><summary>When should I announce my pregnancy?</summary>
<div class="answer">Most Australian families tell close family between 6 and 10 weeks (after the first scan), and announce more broadly after the 12-week scan when miscarriage risk drops. Public or social media announcements often happen around 14 to 20 weeks once you know the gender from the 20-week scan.</div></details>

<details><summary>How do I do a pregnancy announcement on a budget?</summary>
<div class="answer">A simple announcement can cost as little as $30 to $50. Options include a $29.99 smoke bomb, a $19.99 sports ball, or a free DIY chalkboard with the due date written on it. The most expensive part is usually the photographer — but a phone on a tripod gets brilliant results for free.</div></details>

<details><summary>Are smoke products safe to use for pregnancy announcements?</summary>
<div class="answer">Yes — our gender reveal smoke bombs and cannons are 100% biodegradable, non-toxic, and meet Australian safety standards. They use food-grade cornstarch powder. Always read instructions, use outdoors only, never on total fire ban days, and keep a safe distance during ignition.</div></details>

<details><summary>Can I do a pregnancy announcement indoors?</summary>
<div class="answer">Absolutely. Best indoor options are confetti cannons, balloon pops, gender reveal balloon boxes, and scratch-card reveals. Avoid smoke and powder products indoors as they can trigger smoke alarms and leave a mess that is hard to clean up.</div></details>

<details><summary>What is the difference between a pregnancy announcement and a gender reveal?</summary>
<div class="answer">A pregnancy announcement is when you share that you are expecting — usually in the first trimester. A gender reveal is later, around 18 to 22 weeks, when you announce the baby's sex. Many Australian families combine the two into one event if their families live far apart.</div></details>

<details><summary>How fast is delivery to my city?</summary>
<div class="answer">We dispatch same day from our Gold Coast warehouse. Delivery to Sydney, Brisbane and Gold Coast is 1 to 2 days. Melbourne, Adelaide and Canberra are 1 to 2 days. Perth, Hobart and Darwin are 2 to 4 days. Free shipping on all orders over $150.</div></details>

</div>

<div class="cta-final">
<h2 style="font-size:26px">Ready to plan your pregnancy announcement?</h2>
<p>Browse Australia's largest range of pregnancy and gender reveal products. Family-owned, eco-friendly, and shipped same-day from the Gold Coast.</p>
<a href="https://genderrevealideas.com.au/collections/all">Shop the full range &rarr;</a>
</div>

<p style="text-align:center;font-size:14px;color:#777;margin-top:32px"><em>Gender Reveal Ideas is Australia's #1 gender reveal and pregnancy announcement store. Family-owned, Gold Coast based, 4.85★ from 1,360+ verified customer reviews.</em></p>

<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BlogPosting",
      "@id": `${URL_FULL}#article`,
      "headline": TITLE,
      "description": META_DESC,
      "datePublished": "2026-05-18",
      "dateModified": "2026-05-18",
      "author": { "@type": "Organization", "name": "Gender Reveal Ideas", "url": "https://genderrevealideas.com.au" },
      "publisher": { "@type": "Organization", "name": "Gender Reveal Ideas", "url": "https://genderrevealideas.com.au", "logo": { "@type": "ImageObject", "url": "https://cdn.shopify.com/s/files/1/0584/7410/2873/files/gri-logo.png" } },
      "image": HERO_IMAGE,
      "mainEntityOfPage": URL_FULL,
      "keywords": "pregnancy announcement ideas, pregnancy announcement australia, maternity announcement, pregnancy reveal, baby announcement"
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        { "@type": "Question", "name": "What is the most popular pregnancy announcement idea in Australia?", "acceptedAnswer": { "@type": "Answer", "text": "Coloured smoke reveals are the most popular pregnancy announcement style in Australia in 2026 because they photograph beautifully, work in outdoor settings, and can double as a gender reveal." } },
        { "@type": "Question", "name": "When should I announce my pregnancy?", "acceptedAnswer": { "@type": "Answer", "text": "Most Australian families tell close family between 6 and 10 weeks, and announce more broadly after the 12-week scan. Public announcements often happen around 14 to 20 weeks." } },
        { "@type": "Question", "name": "Are smoke products safe for pregnancy announcements?", "acceptedAnswer": { "@type": "Answer", "text": "Yes — gender reveal smoke bombs are 100% biodegradable, non-toxic, food-grade cornstarch powder. Always use outdoors, never on total fire ban days." } },
        { "@type": "Question", "name": "Can I do a pregnancy announcement indoors?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. Best indoor options are confetti cannons, balloon pops, balloon boxes, and scratch-card reveals. Avoid smoke products indoors." } },
        { "@type": "Question", "name": "How fast is delivery to my city?", "acceptedAnswer": { "@type": "Answer", "text": "We dispatch same day from the Gold Coast. Sydney/Brisbane 1-2 days, Melbourne/Adelaide/Canberra 1-2 days, Perth/Hobart/Darwin 2-4 days." } }
      ]
    }
  ]
}, null, 2)}
</script>

</article>
`

// Publish
const blogsR = await rest('/blogs.json')
const blog = blogsR.blogs?.[0]
if (!blog) { console.error('No blog found'); process.exit(1) }
console.log(`Blog: ${blog.title} (id ${blog.id})`)

const existing = await rest(`/blogs/${blog.id}/articles.json?handle=${HANDLE}`)
const existingArt = existing.articles?.find(a => a.handle === HANDLE)

let articleId
if (existingArt) {
  console.log(`Article exists (id ${existingArt.id}), updating...`)
  const u = await rest(`/blogs/${blog.id}/articles/${existingArt.id}.json`, {
    method: 'PUT',
    body: JSON.stringify({ article: {
      id: existingArt.id, title: TITLE, body_html: html, author: 'Gender Reveal Ideas',
      tags: 'pregnancy announcement,pregnancy announcement ideas,maternity announcement,pregnancy reveal,baby announcement,2026',
      summary_html: `<p>${META_DESC}</p>`, handle: HANDLE,
      image: { src: HERO_IMAGE, alt: 'Pregnancy announcement smoke reveal Australia' },
      metafields: [
        { namespace:'global', key:'title_tag', type:'single_line_text_field', value: TITLE },
        { namespace:'global', key:'description_tag', type:'single_line_text_field', value: META_DESC },
      ],
    }})
  })
  articleId = u.article?.id
  console.log(`✓ Updated: ${u.article?.id}`)
} else {
  const c = await rest(`/blogs/${blog.id}/articles.json`, {
    method: 'POST',
    body: JSON.stringify({ article: {
      title: TITLE, body_html: html, author: 'Gender Reveal Ideas',
      tags: 'pregnancy announcement,pregnancy announcement ideas,maternity announcement,pregnancy reveal,baby announcement,2026',
      summary_html: `<p>${META_DESC}</p>`, handle: HANDLE, published: true,
      image: { src: HERO_IMAGE, alt: 'Pregnancy announcement smoke reveal Australia' },
      metafields: [
        { namespace:'global', key:'title_tag', type:'single_line_text_field', value: TITLE },
        { namespace:'global', key:'description_tag', type:'single_line_text_field', value: META_DESC },
      ],
    }})
  })
  articleId = c.article?.id
  console.log(`✓ CREATED: id ${articleId}`)
}
console.log(`\nLIVE URL: ${URL_FULL}`)
console.log(`HTML length: ${html.length}c`)
console.log(`Word count (approx): ${html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').split(' ').length}`)
process.exit(0)
