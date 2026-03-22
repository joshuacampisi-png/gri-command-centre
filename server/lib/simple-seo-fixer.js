/**
 * Simple SEO Fixer
 * Generates meta descriptions and H1s using Claude directly (no OpenClaw agents)
 * Fast, reliable, no CLI dependencies
 */

import { callClaude } from './claude-guard.js'

/**
 * Generate meta description for a page
 */
export async function generateMetaDescription(pagePath, currentValue = null) {
  const pageLabel = pagePath === '/' ? 'homepage' 
    : pagePath.startsWith('/collections/') ? 'collection page'
    : pagePath.startsWith('/pages/') ? 'info page'
    : pagePath.startsWith('/blogs/') ? 'blog'
    : 'page'

  const prompt = `You are an SEO expert for Gender Reveal Ideas (genderrevealideas.com.au), Australia's #1 gender reveal party supply store.

Write a meta description for: ${pagePath} (${pageLabel})

Current meta: ${currentValue || 'MISSING'}

Requirements:
- 150-160 characters EXACTLY
- Include primary keyword: "gender reveal" (unless it's a generic page like contact/shipping)
- Include location signal: "Australia" or "Australian"  
- Action-oriented CTA (Shop, Browse, Discover, Order, etc.)
- Australian English spelling
- Natural, compelling, not keyword-stuffed

Page context:
${pagePath === '/' ? 'Homepage - main store overview'
: pagePath.includes('cannon') ? 'Gender reveal cannons - confetti & powder cannons'
: pagePath.includes('balloon') ? 'Gender reveal balloons - boy/girl balloon kits'
: pagePath.includes('smoke') ? 'Smoke bombs & powder for gender reveals'
: pagePath.includes('contact') ? 'Contact page - customer service info'
: pagePath.includes('shipping') ? 'Shipping & delivery information'
: pagePath.includes('faq') ? 'Frequently asked questions'
: 'Gender reveal party supplies & ideas'}

Write ONLY the meta description text. No explanation, no quotes.`

  const msg = await callClaude({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }]
  }, 'seo-meta-generator')

  const newValue = msg.content[0].text.trim()
  
  return {
    ok: true,
    oldValue: currentValue || '(none)',
    newValue,
    length: newValue.length,
    valid: newValue.length >= 150 && newValue.length <= 160,
    targetKeywords: ['gender reveal', 'Australia'],
  }
}

/**
 * Generate H1 tag for a page
 */
export async function generateH1(pagePath) {
  const pageLabel = pagePath === '/' ? 'homepage' 
    : pagePath.startsWith('/collections/') ? 'collection page'
    : pagePath.startsWith('/pages/') ? 'info page'
    : 'page'

  const prompt = `You are an SEO expert for Gender Reveal Ideas (genderrevealideas.com.au).

Write an H1 heading for: ${pagePath} (${pageLabel})

Requirements:
- Under 70 characters
- Include primary keyword naturally
- Clear, descriptive, engaging
- Australian English
- Title case

Page context:
${pagePath === '/' ? 'Homepage - main store'
: pagePath.includes('cannon') ? 'Gender reveal cannons collection'
: pagePath.includes('balloon') ? 'Gender reveal balloons collection'
: pagePath.includes('smoke') ? 'Smoke bombs & powder collection'
: pagePath.includes('contact') ? 'Contact us page'
: pagePath.includes('shipping') ? 'Shipping information'
: pagePath.includes('faq') ? 'FAQ page'
: 'Collection page'}

Write ONLY the H1 text. No explanation, no quotes.`

  const msg = await callClaude({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 100,
    messages: [{ role: 'user', content: prompt }]
  }, 'seo-h1-generator')

  const h1 = msg.content[0].text.trim()
  
  return {
    ok: true,
    h1,
    length: h1.length,
    valid: h1.length <= 70,
  }
}
