/**
 * calendar-publisher.js
 * Monitors calendar entries and auto-publishes to Instagram when scheduled time arrives.
 */
import cron from 'node-cron';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dataFile } from './data-dir.js';
import { isInstagramConfigured, publishImage, publishCarousel, publishReel } from './instagram-publisher.js';

const CALENDAR_FILE = dataFile('calendar-entries.json');
const IG_POSTS_FILE = dataFile('instagram-posts.json');

function loadCalendar() {
  if (!existsSync(CALENDAR_FILE)) return [];
  try { return JSON.parse(readFileSync(CALENDAR_FILE, 'utf8')); }
  catch { return []; }
}

function saveCalendar(entries) {
  writeFileSync(CALENDAR_FILE, JSON.stringify(entries, null, 2));
}

function loadIGPosts() {
  if (!existsSync(IG_POSTS_FILE)) return [];
  try { return JSON.parse(readFileSync(IG_POSTS_FILE, 'utf8')); }
  catch { return []; }
}

function saveIGPosts(posts) {
  writeFileSync(IG_POSTS_FILE, JSON.stringify(posts, null, 2));
}

/**
 * Check calendar for entries due to publish and move them to Instagram scheduler
 */
async function syncCalendarToInstagram() {
  if (!isInstagramConfigured()) return;

  const calendar = loadCalendar();
  const igPosts = loadIGPosts();
  const now = new Date();
  
  // AEST timezone (UTC+10)
  const aestNow = new Date(now.getTime() + 10 * 60 * 60 * 1000);
  const todayAEST = aestNow.toISOString().split('T')[0];
  const currentHour = aestNow.getUTCHours();
  const currentMinute = aestNow.getUTCMinutes();

  let calendarChanged = false;
  let igChanged = false;

  for (const entry of calendar) {
    // Skip if not scheduled or already archived
    if (entry.status !== 'Scheduled' || entry._archived) continue;
    
    // Skip if not Instagram
    if (!entry.platform?.toLowerCase().includes('instagram')) continue;
    
    // Check if it's time to publish
    if (entry.date !== todayAEST) continue;
    
    // Parse scheduled time (format: "10:00" or "14:30")
    const [schedHour, schedMinute] = (entry.time || '00:00').split(':').map(Number);
    
    // Not time yet
    if (currentHour < schedHour || (currentHour === schedHour && currentMinute < schedMinute)) {
      continue;
    }
    
    // Time has arrived! Move to Instagram scheduler
    console.log(`[Calendar→IG] Publishing calendar entry: ${entry.id} (${entry.hook})`);
    
    // Check if already moved
    const alreadyMoved = igPosts.find(p => p.calendarId === entry.id);
    if (alreadyMoved) {
      console.log(`[Calendar→IG] Entry ${entry.id} already in IG scheduler, skipping`);
      continue;
    }
    
    // Create IG post from calendar entry
    const igPost = {
      id: `cal-${entry.id}-${Date.now()}`,
      calendarId: entry.id,
      type: entry.platform.toLowerCase().includes('reel') ? 'reel' : 'image',
      caption: buildCaption(entry),
      mediaUrls: entry.videoUrl ? [entry.videoUrl] : [],
      scheduledAt: now.toISOString(), // Publish immediately
      status: 'SCHEDULED',
      attempts: 0,
      igPostId: null,
      igPermalink: null,
      error: null,
      publishedAt: null,
      createdAt: now.toISOString(),
    };
    
    igPosts.push(igPost);
    igChanged = true;
    
    // Mark calendar entry as published
    entry.status = 'Published';
    entry._publishedAt = now.toISOString();
    calendarChanged = true;
    
    console.log(`[Calendar→IG] Created IG post ${igPost.id} from calendar entry ${entry.id}`);
  }

  if (calendarChanged) saveCalendar(calendar);
  if (igChanged) saveIGPosts(igPosts);
}

/**
 * Build Instagram caption from calendar entry
 */
function buildCaption(entry) {
  let caption = '';
  
  if (entry.hook) caption += entry.hook + '\n\n';
  if (entry.caption) caption += entry.caption + '\n\n';
  if (entry.cta) caption += entry.cta + '\n\n';
  
  // Add default hashtags if none present
  if (!caption.includes('#')) {
    caption += '#genderreveal #genderrevealideas #babyreveal';
  }
  
  return caption.trim();
}

/**
 * Start calendar publisher cron (checks every minute)
 */
export function startCalendarPublisher() {
  if (!isInstagramConfigured()) {
    console.log('[Calendar→IG] Instagram not configured — calendar publisher disabled');
    return;
  }

  cron.schedule('* * * * *', async () => {
    try {
      await syncCalendarToInstagram();
    } catch (err) {
      console.error('[Calendar→IG] Sync error:', err.message);
    }
  }, { timezone: 'Australia/Brisbane' });

  console.log('[Calendar→IG] Calendar publisher started (checks every minute)');
}
