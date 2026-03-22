/**
 * REAL TikTok Scraper - Gets actual trending videos
 * Uses TikTok's public endpoints
 */

/**
 * Scrape real TikTok trending videos for #genderreveal
 * @returns {Array} Real videos from last 24h
 */
export async function scrapeRealTikTokTrending() {
  const videos = [];
  
  try {
    // Use TikTok's public API endpoint (no auth required)
    // This searches for trending hashtag content
    
    const hashtag = 'genderreveal';
    const minViews = 500000; // 500K minimum
    
    console.log('[TikTok] Searching for real trending videos...');
    
    // TikTok public API endpoint for hashtag search
    // Note: This may require user-agent spoofing to work
    const url = `https://www.tiktok.com/api/challenge/item_list/?aid=1988&count=30&challengeName=${hashtag}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.tiktok.com/',
      }
    });
    
    if (!response.ok) {
      console.warn('[TikTok] API request failed, status:', response.status);
      throw new Error('TikTok API unavailable');
    }
    
    const data = await response.json();
    
    if (!data.itemList || data.itemList.length === 0) {
      console.warn('[TikTok] No videos found in response');
      throw new Error('No videos found');
    }
    
    // Parse videos from response
    const now = Date.now();
    const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
    
    data.itemList.forEach(item => {
      const video = item.video || {};
      const stats = item.stats || {};
      const author = item.author || {};
      const createTime = item.createTime * 1000; // Convert to milliseconds
      
      // Filter: last 24h only and minimum views
      if (createTime > twentyFourHoursAgo && stats.playCount >= minViews) {
        videos.push({
          id: item.id,
          url: `https://www.tiktok.com/@${author.uniqueId}/video/${item.id}`,
          title: item.desc || 'Untitled video',
          creator: `@${author.uniqueId}`,
          views: stats.playCount,
          likes: stats.diggCount,
          createdAt: new Date(createTime).toISOString(),
          relevance: analyzeRelevance(item.desc || '')
        });
      }
    });
    
    console.log(`[TikTok] Found ${videos.length} real trending videos`);
    
  } catch (e) {
    console.error('[TikTok] Real scraping failed:', e.message);
    console.log('[TikTok] Falling back to alternative method...');
    
    // Fallback: Try alternative scraping method
    return await scrapeTikTokAlternative();
  }
  
  return videos.sort((a, b) => b.views - a.views);
}

/**
 * Alternative TikTok scraping method
 * Uses different endpoint or scraping technique
 */
async function scrapeTikTokAlternative() {
  // Alternative approach: Use RSS feed or other public endpoint
  // For now, return empty array if main method fails
  console.warn('[TikTok] No alternative method available yet');
  return [];
}

/**
 * Analyze video relevance to GRI business
 */
function analyzeRelevance(description) {
  const text = description.toLowerCase();
  
  if (text.includes('smoke') || text.includes('powder')) {
    return 'Smoke/powder reveal trending - promote smoke bomb products';
  }
  if (text.includes('confetti') || text.includes('cannon')) {
    return 'Confetti cannons gaining popularity - highlight confetti products';
  }
  if (text.includes('balloon')) {
    return 'Balloon reveals trending - opportunity for balloon kit sales';
  }
  if (text.includes('fail') || text.includes('wrong')) {
    return 'Failed reveals show need for quality products - promote reliability';
  }
  
  return 'Trending gender reveal format - market validation';
}
