/**
 * Viral Video Tracker — Find trending gender reveal content
 * Scrapes TikTok, Instagram, YouTube for viral videos in last 24h
 */

import { getFreeViralVideos } from './free-viral-scraper.js'

/**
 * Find viral gender reveal videos from last 24 hours
 * @returns {Array} Top 3 viral videos with links
 */
export async function getViralVideos() {
  const videos = []
  
  try {
    console.log('[Viral] Fetching trending videos using FREE methods (no API keys)...')
    
    // Use free scraping methods
    const freeVideos = await getFreeViralVideos()
    videos.push(...freeVideos)
    
    console.log(`[Viral] Total: ${videos.length} videos from last 24h`)
  } catch (e) {
    console.error('[Viral] Error fetching videos:', e.message)
  }
  
  // Sort by views, take top 3
  const topVideos = videos
    .sort((a, b) => b.views - a.views)
    .slice(0, 3)
  
  console.log(`[Viral] Top 3 selected (${topVideos.map(v => v.platform).join(', ')})`)
  
  return topVideos
}

// Scraper functions moved to separate files:
// - tiktok-scraper.js
// - youtube-scraper.js  
// - instagram-scraper.js

/**
 * Format viral videos for briefing
 */
export function formatViralBriefing(videos) {
  if (!videos || videos.length === 0) {
    return '⚠️ No viral videos detected in last 24h'
  }
  
  let briefing = 'VIRAL VIDEOS (Last 24 Hours):\n\n'
  
  videos.forEach((v, i) => {
    const viewsFormatted = v.views >= 1000000 
      ? `${(v.views / 1000000).toFixed(1)}M`
      : `${(v.views / 1000).toFixed(0)}K`
    
    briefing += `${i + 1}. 🎬 ${v.platform} — "${v.title}" (${viewsFormatted} views)\n`
    briefing += `   Link: ${v.url}\n`
    briefing += `   Why: ${v.relevance}\n\n`
  })
  
  return briefing
}

/**
 * Generate strategic recommendations based on viral trends
 */
export function generateStrategicRecs(videos, keywordData) {
  const recs = []
  
  // Quick wins
  if (videos.length > 0) {
    recs.push({
      type: 'Quick Win (Today)',
      action: `Post viral-inspired content to Instagram (use trending format from ${videos[0].platform})`,
      time: '30 min',
    })
  }
  
  // This week
  recs.push({
    type: 'This Week',
    action: 'Launch "Safety Bundle" - capitalize on viral safety concerns',
    time: '2-3 days',
  })
  
  // Long-term
  if (videos.some(v => v.title.toLowerCase().includes('stadium') || v.title.toLowerCase().includes('sports'))) {
    recs.push({
      type: 'Long-term',
      action: 'Partner with sports venues for stadium reveal packages',
      time: '2-4 weeks',
    })
  }
  
  return recs
}

/**
 * Format strategic recommendations for briefing
 */
export function formatStrategicRecs(recs) {
  let briefing = 'STRATEGIC RECOMMENDATIONS:\n\n'
  
  recs.forEach(rec => {
    briefing += `✅ ${rec.type}: ${rec.action}\n`
  })
  
  return briefing
}
