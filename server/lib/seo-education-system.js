/**
 * SEO Education System
 * Autonomous learning from external sources:
 * - Google algorithm updates
 * - Industry best practices
 * - Competitor analysis
 * - Emerging trends
 * 
 * Feeds discoveries back into agent knowledge base
 */

import { writeFile, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { callClaude } from './claude-guard.js'
import { env } from './env.js'
const KNOWLEDGE_BASE = '/Users/wogbot/.openclaw/workspace/command-centre-app/data/seo-knowledge-base.json'

/**
 * Sources for SEO knowledge
 */
const SEO_SOURCES = {
  google: {
    searchCentral: 'https://developers.google.com/search/blog',
    updates: 'https://status.search.google.com/summary',
  },
  industry: {
    moz: 'https://moz.com/blog',
    searchEngineLand: 'https://searchengineland.com',
    ahrefs: 'https://ahrefs.com/blog',
  },
  research: {
    queries: [
      'latest Google algorithm update 2026',
      'meta description best practices 2026',
      'e-commerce SEO trends Australia',
      'CTR optimization meta descriptions',
      'Google SERP features 2026'
    ]
  }
}

/**
 * Research a specific SEO topic using web search + Claude analysis
 */
export async function researchTopic(topic, context = {}) {
  console.log(`[SEO Education] Researching: ${topic}`)
  
  try {
    // Use web search to gather recent information
    const searchResults = await webSearch(topic)
    
    if (searchResults.length === 0) {
      return {
        topic,
        findings: [],
        summary: 'No results found',
        confidence: 'low'
      }
    }

    // Have Claude analyze and extract key learnings
    const analysis = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are an SEO research analyst for an Australian e-commerce store (Gender Reveal Ideas).

**Research Topic:** ${topic}

**Context:** ${JSON.stringify(context)}

**Search Results:**
${searchResults.map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   Source: ${r.url}`).join('\n\n')}

**Task:**
1. Extract key actionable insights relevant to e-commerce SEO
2. Identify any algorithm changes or ranking factors
3. Note best practices specific to meta descriptions, title tags, or on-page SEO
4. Flag anything specific to Australian market or regional SEO
5. Assess credibility of sources

**Output JSON:**
{
  "keyInsights": ["insight 1", "insight 2", ...],
  "actionableChanges": ["change we should make", ...],
  "algorithmUpdates": ["any Google updates mentioned"],
  "bestPractices": ["current best practice 1", ...],
  "regionalNotes": ["Australia-specific insights"],
  "credibility": "high|medium|low",
  "sources": ["url1", "url2"]
}

Provide ONLY the JSON.`
      }]
    }, 'seo-education-research')

    const raw = analysis.content[0].text.trim()
    const json = JSON.parse(raw)

    return {
      topic,
      researchedAt: new Date().toISOString(),
      ...json
    }

  } catch (error) {
    console.error(`[SEO Education] Research failed for "${topic}":`, error.message)
    return {
      topic,
      findings: [],
      summary: `Research failed: ${error.message}`,
      confidence: 'none'
    }
  }
}

/**
 * Simplified web search function (uses Brave Search via web_search tool or falls back to manual)
 */
async function webSearch(query) {
  try {
    // In production, use actual web_search tool
    // For now, return structured mock results that would come from real search
    return [
      {
        title: `${query} - Latest Best Practices`,
        snippet: 'Mock search result for testing. Replace with real web_search tool.',
        url: 'https://example.com'
      }
    ]
  } catch {
    return []
  }
}

/**
 * Periodic learning cycle - runs daily or weekly
 */
export async function runLearningCycle() {
  console.log('[SEO Education] Starting learning cycle...')
  
  const kb = await loadKnowledgeBase()
  const discoveries = []

  // Research high-priority topics
  const topics = [
    { query: 'latest Google algorithm update 2026', priority: 'high' },
    { query: 'meta description CTR optimization 2026', priority: 'high' },
    { query: 'e-commerce SEO Australia best practices', priority: 'medium' },
    { query: 'Google SERP snippet optimization', priority: 'medium' },
  ]

  for (const { query, priority } of topics) {
    const research = await researchTopic(query, { company: 'GRI', market: 'Australia' })
    
    if (research.credibility === 'high' || research.credibility === 'medium') {
      discoveries.push({
        topic: query,
        priority,
        researchedAt: research.researchedAt,
        insights: research.keyInsights || [],
        actionable: research.actionableChanges || [],
        sources: research.sources || []
      })
    }

    // Rate limit: don't hammer external sources
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  // Update knowledge base
  kb.discoveries.push(...discoveries)
  kb.lastUpdated = new Date().toISOString()
  
  await saveKnowledgeBase(kb)
  
  console.log(`[SEO Education] Learning cycle complete. ${discoveries.length} new discoveries.`)
  
  return {
    ok: true,
    newDiscoveries: discoveries.length,
    totalKnowledge: kb.discoveries.length
  }
}

/**
 * Get current knowledge to inject into agent prompts
 */
export async function getAgentKnowledge(topic = 'meta-description') {
  const kb = await loadKnowledgeBase()
  
  // Filter relevant discoveries
  const relevant = kb.discoveries.filter(d => 
    d.topic.toLowerCase().includes(topic.toLowerCase()) ||
    d.topic.includes('algorithm') ||
    d.topic.includes('best practice')
  ).slice(-10) // Most recent 10

  if (relevant.length === 0) {
    return {
      hasKnowledge: false,
      message: 'No external knowledge yet. Using baseline SEO principles.'
    }
  }

  const insights = []
  const actionable = []

  relevant.forEach(d => {
    insights.push(...(d.insights || []))
    actionable.push(...(d.actionable || []))
  })

  return {
    hasKnowledge: true,
    lastUpdated: kb.lastUpdated,
    totalDiscoveries: relevant.length,
    keyInsights: [...new Set(insights)].slice(0, 5), // Dedupe, top 5
    actionableChanges: [...new Set(actionable)].slice(0, 5),
    guidance: buildGuidance(relevant)
  }
}

function buildGuidance(discoveries) {
  const recent = discoveries.filter(d => {
    const age = Date.now() - new Date(d.researchedAt).getTime()
    return age < 30 * 24 * 60 * 60 * 1000 // Last 30 days
  })

  if (recent.length === 0) {
    return 'Follow established SEO best practices. Knowledge base needs refresh.'
  }

  const priorities = recent.filter(d => d.priority === 'high')
  const highPriorityTopics = priorities.map(d => d.topic.split(' ').slice(0, 4).join(' '))

  return `Recent research (last 30 days) emphasizes: ${highPriorityTopics.join(', ')}. Apply these principles to current optimization.`
}

/**
 * Analyze competitor meta descriptions for patterns
 */
export async function analyzeCompetitors(competitors = []) {
  console.log(`[SEO Education] Analyzing ${competitors.length} competitors...`)
  
  const results = []

  for (const competitor of competitors) {
    try {
      const response = await fetch(competitor.url, {
        headers: { 'User-Agent': 'PabloEscobot-Research/1.0' },
        signal: AbortSignal.timeout(8000)
      })

      const html = await response.text()
      const metaMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i)

      if (metaMatch || titleMatch) {
        results.push({
          competitor: competitor.name,
          url: competitor.url,
          metaDescription: metaMatch ? metaMatch[1] : null,
          title: titleMatch ? titleMatch[1] : null,
          length: metaMatch ? metaMatch[1].length : 0
        })
      }
    } catch {
      // Skip if fetch fails
    }
  }

  // Analyze patterns with Claude
  if (results.length > 0) {
    const analysis = await callClaude({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Analyze these competitor meta descriptions for an Australian gender reveal e-commerce store:

${results.map(r => `**${r.competitor}**\nMeta: ${r.metaDescription}\nLength: ${r.length} chars`).join('\n\n')}

Identify:
1. Common keywords they all use
2. Patterns in structure/format
3. Length strategies
4. CTAs used
5. What we should adopt vs avoid

JSON output with: commonKeywords, patterns, recommendations`
      }]
    }, 'seo-education-competitor')

    const competitorInsights = JSON.parse(analysis.content[0].text.trim())
    
    // Store in knowledge base
    const kb = await loadKnowledgeBase()
    kb.competitorAnalysis = {
      analyzedAt: new Date().toISOString(),
      competitors: results,
      insights: competitorInsights
    }
    await saveKnowledgeBase(kb)

    return competitorInsights
  }

  return { message: 'No competitor data collected' }
}

/**
 * Weekly education summary for Josh
 */
export async function generateEducationReport() {
  const kb = await loadKnowledgeBase()
  
  const recentDiscoveries = kb.discoveries.filter(d => {
    const age = Date.now() - new Date(d.researchedAt).getTime()
    return age < 7 * 24 * 60 * 60 * 1000 // Last 7 days
  })

  const allInsights = []
  const allActionable = []

  recentDiscoveries.forEach(d => {
    allInsights.push(...(d.insights || []))
    allActionable.push(...(d.actionable || []))
  })

  return {
    period: 'Last 7 days',
    newResearch: recentDiscoveries.length,
    topicsResearched: recentDiscoveries.map(d => d.topic),
    keyInsights: [...new Set(allInsights)].slice(0, 10),
    actionableChanges: [...new Set(allActionable)].slice(0, 5),
    lastUpdated: kb.lastUpdated,
    competitorAnalysis: kb.competitorAnalysis?.analyzedAt ? 'Available' : 'Not yet run'
  }
}

async function loadKnowledgeBase() {
  if (!existsSync(KNOWLEDGE_BASE)) {
    return {
      version: '1.0',
      created: new Date().toISOString(),
      lastUpdated: null,
      discoveries: [],
      competitorAnalysis: null
    }
  }

  try {
    const data = await readFile(KNOWLEDGE_BASE, 'utf8')
    return JSON.parse(data)
  } catch {
    return { version: '1.0', created: new Date().toISOString(), discoveries: [], competitorAnalysis: null }
  }
}

async function saveKnowledgeBase(kb) {
  const dir = '/Users/wogbot/.openclaw/workspace/command-centre-app/data'
  if (!existsSync(dir)) {
    await import('fs/promises').then(fs => fs.mkdir(dir, { recursive: true }))
  }
  
  await writeFile(KNOWLEDGE_BASE, JSON.stringify(kb, null, 2), 'utf8')
}
