/**
 * REAL YouTube Scraper - Gets actual trending Shorts
 * Uses YouTube Data API v3
 */

import { env } from './env.js';

/**
 * Scrape real YouTube trending shorts
 * @returns {Array} Real videos from last 24h
 */
export async function scrapeRealYouTubeTrending() {
  const videos = [];
  
  try {
    // Check for API key
    const YOUTUBE_API_KEY = env.youtube?.apiKey || process.env.YOUTUBE_API_KEY;
    
    if (!YOUTUBE_API_KEY) {
      console.warn('[YouTube] No API key configured - set YOUTUBE_API_KEY in .env');
      return [];
    }
    
    console.log('[YouTube] Searching for real trending shorts...');
    
    // Search for recent videos
    const searchQuery = 'gender reveal';
    const publishedAfter = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?` +
      `part=snippet` +
      `&q=${encodeURIComponent(searchQuery)}` +
      `&type=video` +
      `&videoDuration=short` + // Shorts only
      `&order=viewCount` +
      `&publishedAfter=${publishedAfter}` +
      `&maxResults=20` +
      `&key=${YOUTUBE_API_KEY}`;
    
    const response = await fetch(searchUrl);
    
    if (!response.ok) {
      console.error('[YouTube] API error:', response.status);
      return [];
    }
    
    const data = await response.json();
    
    if (!data.items || data.items.length === 0) {
      console.warn('[YouTube] No videos found');
      return [];
    }
    
    // Get video statistics
    const videoIds = data.items.map(item => item.id.videoId).join(',');
    const statsUrl = `https://www.googleapis.com/youtube/v3/videos?` +
      `part=statistics,contentDetails,snippet` +
      `&id=${videoIds}` +
      `&key=${YOUTUBE_API_KEY}`;
    
    const statsResponse = await fetch(statsUrl);
    const statsData = await statsResponse.json();
    
    if (!statsData.items) {
      console.warn('[YouTube] No stats data available');
      return [];
    }
    
    // Combine and filter
    statsData.items.forEach(item => {
      const stats = item.statistics;
      const snippet = item.snippet;
      const views = parseInt(stats.viewCount || 0);
      
      // Filter: 500K+ views
      if (views >= 500000) {
        videos.push({
          id: item.id,
          url: `https://youtube.com/shorts/${item.id}`,
          title: snippet.title,
          creator: snippet.channelTitle,
          views: views,
          likes: parseInt(stats.likeCount || 0),
          createdAt: snippet.publishedAt,
          relevance: analyzeRelevance(snippet.title, snippet.description || '')
        });
      }
    });
    
    console.log(`[YouTube] Found ${videos.length} real trending shorts`);
    
  } catch (e) {
    console.error('[YouTube] Real scraping failed:', e.message);
  }
  
  return videos.sort((a, b) => b.views - a.views);
}

/**
 * Analyze video relevance
 */
function analyzeRelevance(title, description) {
  const text = (title + ' ' + description).toLowerCase();
  
  if (text.includes('smoke') || text.includes('powder')) {
    return 'Smoke/powder reveals trending - promote smoke bomb products';
  }
  if (text.includes('confetti') || text.includes('cannon')) {
    return 'Confetti cannons popular - highlight confetti products';
  }
  if (text.includes('balloon')) {
    return 'Balloon reveals trending - market balloon kits';
  }
  if (text.includes('fail') || text.includes('wrong')) {
    return 'Failed reveals show need for quality - promote reliability';
  }
  if (text.includes('outdoor') || text.includes('beach')) {
    return 'Outdoor reveals popular - market weather-resistant products';
  }
  
  return 'Trending gender reveal format - market validation';
}
