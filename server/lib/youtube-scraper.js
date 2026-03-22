/**
 * YouTube Shorts Scraper
 * Finds trending gender reveal shorts using YouTube Data API
 */

/**
 * Scrape YouTube trending shorts
 * Uses YouTube Data API v3
 * @returns {Array} Videos with metadata
 */
export async function scrapeYouTubeTrending() {
  const videos = [];
  
  try {
    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
    
    if (!YOUTUBE_API_KEY) {
      console.warn('[YouTube] No API key - using mock data');
      return getMockYouTubeData();
    }
    
    // Search for recent videos with "gender reveal" keywords
    const searchQuery = 'gender reveal';
    const publishedAfter = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&videoDuration=short&order=viewCount&publishedAfter=${publishedAfter}&maxResults=10&key=${YOUTUBE_API_KEY}`;
    
    const response = await fetch(searchUrl);
    const data = await response.json();
    
    if (!data.items) {
      console.warn('[YouTube] No results found');
      return getMockYouTubeData();
    }
    
    // Get video statistics
    const videoIds = data.items.map(item => item.id.videoId).join(',');
    const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=${videoIds}&key=${YOUTUBE_API_KEY}`;
    
    const statsResponse = await fetch(statsUrl);
    const statsData = await statsResponse.json();
    
    // Combine search results with statistics
    data.items.forEach((item, index) => {
      const stats = statsData.items?.[index]?.statistics;
      const views = parseInt(stats?.viewCount || 0);
      
      if (views >= 500000) { // 500K+ views
        videos.push({
          id: item.id.videoId,
          url: `https://youtube.com/shorts/${item.id.videoId}`,
          title: item.snippet.title,
          creator: item.snippet.channelTitle,
          views: views,
          likes: parseInt(stats?.likeCount || 0),
          createdAt: item.snippet.publishedAt,
          relevance: analyzeRelevance(item.snippet.title, item.snippet.description)
        });
      }
    });
    
    console.log(`[YouTube] Found ${videos.length} trending videos`);
    
  } catch (e) {
    console.error('[YouTube] Scraping failed:', e.message);
    return getMockYouTubeData();
  }
  
  return videos;
}

/**
 * Analyze video relevance to GRI business
 */
function analyzeRelevance(title, description) {
  const text = (title + ' ' + description).toLowerCase();
  
  if (text.includes('smoke') || text.includes('powder')) {
    return 'Smoke/powder reveal trending - promote smoke bomb products';
  }
  if (text.includes('confetti') || text.includes('cannon')) {
    return 'Confetti cannons gaining popularity - highlight confetti products';
  }
  if (text.includes('balloon')) {
    return 'Balloon reveals trending - opportunity for balloon kit sales';
  }
  if (text.includes('outdoor') || text.includes('beach') || text.includes('park')) {
    return 'Outdoor reveals popular - market weather-resistant products';
  }
  if (text.includes('unique') || text.includes('creative')) {
    return 'Customers want unique ideas - showcase unusual reveal methods';
  }
  
  return 'Popular gender reveal format - general market validation';
}

/**
 * Mock YouTube data for development/testing
 */
function getMockYouTubeData() {
  return [
    {
      id: 'abc123xyz789',
      url: 'https://youtube.com/shorts/abc123xyz789',
      title: 'INSANE gender reveal at sports stadium! Crowd goes wild! 🏟️',
      creator: 'Stadium Reveals',
      views: 1100000,
      likes: 85000,
      createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
      relevance: 'Stadium reveals trending - opportunity for large-scale public venue partnerships'
    },
    {
      id: 'def456uvw012',
      url: 'https://youtube.com/shorts/def456uvw012',
      title: 'Gender reveal FAIL compilation - smoke bombs gone wrong 😂',
      creator: 'Reveal Fails',
      views: 890000,
      likes: 62000,
      createdAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
      relevance: 'Failure videos highlight need for quality products - promote reliability and safety'
    }
  ];
}
