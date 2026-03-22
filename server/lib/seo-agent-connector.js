/**
 * SEO Agent Connector
 * Routes SEO tasks through educated SEO agents (seo-team-lead, seo-content, seo-specialist)
 * instead of using generic automated fixes
 */

import { spawn } from 'child_process'

const AGENT_TIMEOUT = 120000 // 2 minutes

/**
 * Spawn OpenClaw SEO agent to analyze and propose fix
 * @param {string} agentId - Agent to use (seo-team-lead, seo-content, seo-specialist)
 * @param {string} task - Task description
 * @param {object} context - Additional context (url, currentValue, etc.)
 */
export async function consultSEOAgent(agentId, task, context = {}) {
  // Enrich context with learnings from past successes
  const { buildAgentContext } = await import('./seo-learning-system.js')
  const learnings = await buildAgentContext(context.issueType, context.url)
  
  // Add external SEO knowledge/education
  const { getAgentKnowledge } = await import('./seo-education-system.js')
  const externalKnowledge = await getAgentKnowledge(context.issueType)
  
  return new Promise((resolve, reject) => {
    const prompt = buildPrompt(task, { ...context, learnings, knowledge: externalKnowledge })
    
    const agent = spawn('openclaw', ['agent', 'run', agentId, '--input', prompt], {
      timeout: AGENT_TIMEOUT
    })

    let output = ''
    let error = ''

    agent.stdout.on('data', (data) => {
      output += data.toString()
    })

    agent.stderr.on('data', (data) => {
      error += data.toString()
    })

    agent.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Agent ${agentId} failed: ${error}`))
        return
      }

      try {
        // Try to parse JSON response
        const result = JSON.parse(output)
        resolve(result)
      } catch {
        // Fallback: return raw output
        resolve({ content: output.trim(), raw: true })
      }
    })

    agent.on('error', (err) => {
      reject(new Error(`Failed to spawn agent: ${err.message}`))
    })
  })
}

function buildPrompt(task, context) {
  const { url, currentValue, issueType, pageType, learnings, knowledge } = context
  
  if (issueType === 'meta-description') {
    return `You are an SEO content specialist for Gender Reveal Ideas (genderrevealideas.com.au), Australia's leading gender reveal party supply store.

**Task:** Rewrite the meta description for: ${url || 'homepage'}

**Current meta description (${currentValue?.length || 0} chars):**
${currentValue || 'None'}

**Page type:** ${pageType || 'Unknown'}

**Requirements:**
1. 150-160 characters (Google's sweet spot)
2. Include primary keyword naturally: "gender reveal" + product category
3. Action-oriented language (Shop, Discover, Order, etc.)
4. Location signal: "Australia" or "Australian"
5. Compelling reason to click (unique value prop)

**Brand voice:**
- Exciting, celebratory, trustworthy
- Focus on making moments magical
- Emphasize range, quality, fast shipping

**Output format (JSON):**
{
  "newValue": "The optimized meta description",
  "reasoning": "Why this works better for SEO and CTR",
  "targetKeywords": ["keyword1", "keyword2"],
  "estimatedCTRImpact": "low|medium|high"
}

Provide ONLY the JSON response.`
  }

  if (issueType === 'alt-text') {
    return `Generate descriptive, SEO-optimized alt text for product images.

**Context:**
- Store: Gender Reveal Ideas (Australia)
- Page: ${url}
- Missing alt text on: ${context.imageCount || 'unknown'} images

**Requirements:**
1. Describe the product clearly
2. Include relevant keywords naturally
3. Be concise (under 125 chars per image)
4. Accessibility-first (useful for screen readers)

**Output (JSON):**
{
  "recommendations": [
    { "selector": "image selector or description", "altText": "descriptive alt text" }
  ],
  "notes": "Any additional SEO recommendations"
}`
  }

  // Fallback for other issue types
  return `${task}\n\nContext: ${JSON.stringify(context)}\n\nProvide strategic SEO recommendations as JSON.`
}

/**
 * Get the right SEO agent for the issue type
 */
export function selectSEOAgent(issueType) {
  const routing = {
    'meta-description': 'seo-content',
    'meta-title': 'seo-content',
    'h1': 'seo-content',
    'alt-text': 'seo-content',
    '404': 'seo-technical',
    'schema': 'seo-schema',
    'sitemap': 'seo-sitemap',
  }
  return routing[issueType] || 'seo-content'
}

export function validateSEOResponse(response, issueType) {
  if (!response) return { valid: false, reason: 'Empty response' }

  if (issueType === 'meta-description') {
    const { newValue, reasoning, targetKeywords } = response
    
    if (!newValue || newValue.length < 120 || newValue.length > 160) {
      return { valid: false, reason: `Invalid length: ${newValue?.length || 0} chars (need 150-160)` }
    }

    if (!reasoning || reasoning.length < 20) {
      return { valid: false, reason: 'Missing or weak reasoning' }
    }

    if (!targetKeywords || !Array.isArray(targetKeywords) || targetKeywords.length === 0) {
      return { valid: false, reason: 'No target keywords identified' }
    }

    return { valid: true }
  }

  // Default: accept if response exists
  return { valid: true }
}
