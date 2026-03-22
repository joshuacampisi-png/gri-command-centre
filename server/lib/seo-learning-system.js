/**
 * SEO Learning System
 * Tracks SEO changes, measures impact, feeds learnings back to agents
 */

import { writeFile, readFile } from 'fs/promises'
import { existsSync } from 'fs'

const LEARNING_LOG = '/Users/wogbot/.openclaw/workspace/command-centre-app/data/seo-learnings.json'

/**
 * Log an SEO change with its context
 */
export async function logSEOChange(change) {
  const learnings = await loadLearnings()
  
  const entry = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    company: change.company || 'GRI',
    page: change.page || '/',
    changeType: change.changeType, // 'meta-description', 'meta-title', etc.
    agent: change.agent, // which SEO agent was consulted
    oldValue: change.oldValue,
    newValue: change.newValue,
    targetKeywords: change.targetKeywords || [],
    reasoning: change.reasoning,
    approvedBy: change.approvedBy || 'Josh',
    approvedAt: new Date().toISOString(),
    
    // Performance tracking (to be filled in later)
    metrics: {
      impressions: null,
      clicks: null,
      ctr: null,
      avgPosition: null,
      measuredAt: null
    }
  }

  learnings.changes.push(entry)
  await saveLearnings(learnings)
  
  return entry
}

/**
 * Record performance data for a change (from Search Console, analytics, etc.)
 */
export async function recordPerformance(changeId, metrics) {
  const learnings = await loadLearnings()
  const change = learnings.changes.find(c => c.id === changeId)
  
  if (!change) return { ok: false, error: 'Change not found' }
  
  change.metrics = {
    ...change.metrics,
    ...metrics,
    measuredAt: new Date().toISOString()
  }
  
  await saveLearnings(learnings)
  return { ok: true, change }
}

/**
 * Get successful patterns for a specific change type
 * Returns examples that had high CTR improvement
 */
export async function getSuccessfulPatterns(changeType) {
  const learnings = await loadLearnings()
  
  return learnings.changes
    .filter(c => c.changeType === changeType)
    .filter(c => c.metrics.ctr !== null)
    .sort((a, b) => (b.metrics.ctr || 0) - (a.metrics.ctr || 0))
    .slice(0, 10) // Top 10 performing changes
    .map(c => ({
      page: c.page,
      keywords: c.targetKeywords,
      newValue: c.newValue,
      ctr: c.metrics.ctr,
      reasoning: c.reasoning
    }))
}

/**
 * Generate learning insights for agents
 * This gets fed back into agent prompts
 */
export async function generateLearningInsights() {
  const learnings = await loadLearnings()
  const measured = learnings.changes.filter(c => c.metrics.ctr !== null)
  
  if (measured.length < 5) {
    return {
      summary: 'Not enough data yet. Need at least 5 measured changes.',
      insights: []
    }
  }

  // Group by change type
  const byType = {}
  measured.forEach(c => {
    if (!byType[c.changeType]) byType[c.changeType] = []
    byType[c.changeType].push(c)
  })

  const insights = []

  Object.entries(byType).forEach(([type, changes]) => {
    const avgCTR = changes.reduce((sum, c) => sum + (c.metrics.ctr || 0), 0) / changes.length
    const topKeywords = {}
    
    changes.forEach(c => {
      c.targetKeywords.forEach(kw => {
        if (!topKeywords[kw]) topKeywords[kw] = { count: 0, avgCTR: 0 }
        topKeywords[kw].count++
        topKeywords[kw].avgCTR += c.metrics.ctr || 0
      })
    })

    Object.keys(topKeywords).forEach(kw => {
      topKeywords[kw].avgCTR /= topKeywords[kw].count
    })

    const bestKeywords = Object.entries(topKeywords)
      .sort((a, b) => b[1].avgCTR - a[1].avgCTR)
      .slice(0, 5)
      .map(([kw, data]) => ({ keyword: kw, avgCTR: data.avgCTR, uses: data.count }))

    insights.push({
      changeType: type,
      totalChanges: changes.length,
      avgCTR,
      bestKeywords,
      bestExample: changes.sort((a, b) => (b.metrics.ctr || 0) - (a.metrics.ctr || 0))[0]
    })
  })

  return {
    summary: `Analyzed ${measured.length} SEO changes across ${Object.keys(byType).length} types`,
    totalChanges: measured.length,
    insights
  }
}

/**
 * Build enhanced context for SEO agents based on learnings
 */
export async function buildAgentContext(changeType, page) {
  const patterns = await getSuccessfulPatterns(changeType)
  
  if (patterns.length === 0) {
    return {
      hasLearnings: false,
      message: 'No historical data yet. Use best practices.'
    }
  }

  const keywordFrequency = {}
  patterns.forEach(p => {
    p.keywords.forEach(kw => {
      keywordFrequency[kw] = (keywordFrequency[kw] || 0) + 1
    })
  })

  const topKeywords = Object.entries(keywordFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([kw]) => kw)

  return {
    hasLearnings: true,
    successfulPatterns: patterns,
    recommendedKeywords: topKeywords,
    bestExample: patterns[0],
    guidance: `Based on ${patterns.length} successful ${changeType} changes, prioritize these keywords: ${topKeywords.join(', ')}`
  }
}

async function loadLearnings() {
  if (!existsSync(LEARNING_LOG)) {
    return {
      version: '1.0',
      created: new Date().toISOString(),
      changes: []
    }
  }

  try {
    const data = await readFile(LEARNING_LOG, 'utf8')
    return JSON.parse(data)
  } catch {
    return { version: '1.0', created: new Date().toISOString(), changes: [] }
  }
}

async function saveLearnings(learnings) {
  const dir = '/Users/wogbot/.openclaw/workspace/command-centre-app/data'
  if (!existsSync(dir)) {
    await import('fs/promises').then(fs => fs.mkdir(dir, { recursive: true }))
  }
  
  await writeFile(LEARNING_LOG, JSON.stringify(learnings, null, 2), 'utf8')
}

/**
 * Weekly learning report for Josh
 */
export async function generateWeeklyReport() {
  const learnings = await loadLearnings()
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  
  const recentChanges = learnings.changes.filter(c => 
    new Date(c.timestamp) > oneWeekAgo
  )

  const measured = recentChanges.filter(c => c.metrics.ctr !== null)
  
  const avgCTRBefore = measured.length > 0 
    ? measured.reduce((sum, c) => sum + (parseFloat(c.oldValue?.match(/CTR: ([\d.]+)/)?.[1]) || 0), 0) / measured.length
    : 0

  const avgCTRAfter = measured.length > 0
    ? measured.reduce((sum, c) => sum + (c.metrics.ctr || 0), 0) / measured.length
    : 0

  const improvement = avgCTRAfter - avgCTRBefore

  return {
    period: '7 days',
    totalChanges: recentChanges.length,
    measuredChanges: measured.length,
    avgCTRImprovement: improvement.toFixed(2) + '%',
    topPerformers: measured.sort((a, b) => (b.metrics.ctr || 0) - (a.metrics.ctr || 0)).slice(0, 3),
    agentsUsed: [...new Set(recentChanges.map(c => c.agent))],
    recommendations: generateRecommendations(recentChanges)
  }
}

function generateRecommendations(changes) {
  const recs = []

  const metaChanges = changes.filter(c => c.changeType === 'meta-description')
  if (metaChanges.length > 10) {
    recs.push('Consider batching similar pages to maintain consistency')
  }

  const keywordFreq = {}
  changes.forEach(c => {
    c.targetKeywords?.forEach(kw => {
      keywordFreq[kw] = (keywordFreq[kw] || 0) + 1
    })
  })

  const overusedKeywords = Object.entries(keywordFreq)
    .filter(([_, count]) => count > 5)
    .map(([kw]) => kw)

  if (overusedKeywords.length > 0) {
    recs.push(`Keywords possibly overused: ${overusedKeywords.join(', ')}. Consider diversifying.`)
  }

  return recs
}
