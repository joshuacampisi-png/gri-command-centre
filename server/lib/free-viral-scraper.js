/**
 * FREE Viral Video Scraper
 * No API keys needed - uses public RSS feeds and web scraping
 */

/**
 * Get viral gender reveal videos using free methods
 * @returns {Array} Trending videos from last 24h
 */
export async function getFreeViralVideos() {
  const videos = [];
  
  try {
    console.log('[Free Viral] Scraping trending videos (no API keys)...');
    
    // Method 1: Try YouTube RSS feed for gender reveal search
    const youtubeVideos = await scrapeYouTubeRSS();
    videos.push(...youtubeVideos);
    
    // Method 2: Try TikTok trending page
    const tiktokVideos = await scrapeTikTokWeb();
    videos.push(...tiktokVideos);
    
    console.log(`[Free Viral] Found ${videos.length} total videos`);
    
  } catch (e) {
    console.error('[Free Viral] Scraping failed:', e.message);
  }
  
  // Sort by estimated popularity and take top 3
  return videos
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 3);
}

/**
 * Scrape YouTube using RSS feed (no API key needed)
 */
async function scrapeYouTubeRSS() {
  const videos = [];
  
  try {
    // YouTube RSS feed for search results
    const searchQuery = 'gender reveal';
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?search_query=${encodeURIComponent(searchQuery)}`;
    
    const response = await fetch(rssUrl);
    
    if (!response.ok) {
      console.warn('[YouTube RSS] Failed:', response.status);
      return [];
    }
    
    const xml = await response.text();
    
    // Parse XML to extract video data
    // Simple regex parsing (in production, use proper XML parser)
    const videoMatches = xml.matchAll(/<entry>.*?<\/entry>/gs);
    
    for (const match of videoMatches) {
      const entry = match[0];
      
      // Extract video ID
      const idMatch = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
      const titleMatch = entry.match(/<title>(.*?)<\/title>/);
      const authorMatch = entry.match(/<name>(.*?)<\/name>/);
      const publishedMatch = entry.match(/<published>(.*?)<\/published>/);
      
      if (idMatch && titleMatch) {
        const videoId = idMatch[1];
        const title = titleMatch[1];
        const author = authorMatch ? authorMatch[1] : 'Unknown';
        const published = publishedMatch ? new Date(publishedMatch[1]) : new Date();
        
        // Filter: last 24 hours only
        const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
        if (published.getTime() > twentyFourHoursAgo) {
          videos.push({
            platform: 'YouTube',
            id: videoId,
            url: `https://youtube.com/watch?v=${videoId}`,
            title: title,
            creator: author,
            views: null, // RSS doesn't include view count
            createdAt: published.toISOString(),
            relevance: analyzeRelevance(title)
          });
        }
      }
    }
    
    console.log(`[YouTube RSS] Found ${videos.length} recent videos`);
    
  } catch (e) {
    console.error('[YouTube RSS] Error:', e.message);
  }
  
  return videos;
}

/**
 * Scrape TikTok trending hashtag page
 */
async function scrapeTikTokWeb() {
  const videos = [];
  
  try {
    // TikTok hashtag page
    const hashtag = 'genderreveal';
    const url = `https://www.tiktok.com/tag/${hashtag}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });
    
    if (!response.ok) {
      console.warn('[TikTok Web] Failed:', response.status);
      return [];
    }
    
    const html = await response.text();
    
    // Look for JSON data embedded in the page
    const jsonMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/);
    
    if (jsonMatch) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        
        // Navigate the data structure to find videos
        // TikTok's structure changes frequently, this is a best-effort attempt
        const itemList = data?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
        
        if (itemList) {
          // Process video data
          console.log('[TikTok Web] Found video data');
          // Would need to parse the specific structure here
        }
      } catch (e) {
        console.warn('[TikTok Web] JSON parsing failed:', e.message);
      }
    }
    
    console.log(`[TikTok Web] Found ${videos.length} videos`);
    
  } catch (e) {
    console.error('[TikTok Web] Error:', e.message);
  }
  
  return videos;
}

/**
 * Analyze relevance to GRI business
 */
function analyzeRelevance(title) {
  const text = title.toLowerCase();
  
  if (text.includes('smoke') || text.includes('powder')) {
    return 'Smoke/powder reveal trending - promote smoke bomb products';
  }
  if (text.includes('confetti') || text.includes('cannon')) {
    return 'Confetti cannons popular - highlight confetti products';
  }
  if (text.includes('balloon')) {
    return 'Balloon reveals trending - market balloon kits';
  }
  if (text.includes('fail') || text.includes('wrong')) {
    return 'Failed reveals show need for quality products';
  }
  if (text.includes('outdoor') || text.includes('beach')) {
    return 'Outdoor reveals popular - market weather-resistant products';
  }
  
  return 'Trending gender reveal format';
}
