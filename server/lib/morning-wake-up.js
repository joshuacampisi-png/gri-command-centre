/**
 * Josh's Personal Morning Wake-Up
 * Fires at 5:00 AM AEST daily
 * 
 * Structure:
 * - Greeting + Scripture
 * - Kids Development (3 points each)
 * - Work/Life Balance Message
 * - GRI Business Insights (trends, spikes, focus areas)
 */

import { env } from './env.js';

const JOSH_CHAT = '8040702286';
const MANAGER_CHAT = '5113119463';

/**
 * Bible verses about God's faithfulness in hard times
 */
const FAITHFULNESS_VERSES = [
  {
    verse: "The LORD is my strength and my shield; my heart trusts in him, and he helps me.",
    reference: "Psalm 28:7"
  },
  {
    verse: "The LORD is close to the brokenhearted and saves those who are crushed in spirit.",
    reference: "Psalm 34:18"
  },
  {
    verse: "Cast all your anxiety on him because he cares for you.",
    reference: "1 Peter 5:7"
  },
  {
    verse: "The LORD is good, a refuge in times of trouble. He cares for those who trust in him.",
    reference: "Nahum 1:7"
  },
  {
    verse: "I can do all things through Christ who strengthens me.",
    reference: "Philippians 4:13"
  },
  {
    verse: "Be strong and courageous. Do not be afraid; do not be discouraged, for the LORD your God will be with you wherever you go.",
    reference: "Joshua 1:9"
  },
  {
    verse: "The LORD himself goes before you and will be with you; he will never leave you nor forsake you.",
    reference: "Deuteronomy 31:8"
  },
  {
    verse: "Trust in the LORD with all your heart and lean not on your own understanding.",
    reference: "Proverbs 3:5"
  },
  {
    verse: "God is our refuge and strength, an ever-present help in trouble.",
    reference: "Psalm 46:1"
  },
  {
    verse: "For I know the plans I have for you, declares the LORD, plans to prosper you and not to harm you, plans to give you hope and a future.",
    reference: "Jeremiah 29:11"
  }
];

/**
 * Kids development milestones by age
 */
const KIDS_DEVELOPMENT = {
  caleb_6: [
    "🧠 Reading fluency growing - practice sight words together",
    "⚽ Physical coordination improving - great time for sports skills",
    "🤝 Social skills developing - encourage teamwork and sharing",
    "🎨 Creative expression expanding - art and music boost confidence",
    "💪 Independence building - let him help with simple responsibilities",
    "📚 Critical thinking emerging - ask 'why' questions to develop reasoning"
  ],
  bella_4: [
    "🎭 Sanguine personality shining - her joy is contagious, nurture it!",
    "🗣️ Language explosion happening - rich conversations build vocabulary",
    "🎨 Imagination at peak - dramatic play develops emotional intelligence",
    "👯 Friendship skills forming - playdates teach empathy and cooperation",
    "💃 Energy and enthusiasm - channel it into dance, movement, exploration",
    "🌈 Emotional awareness growing - name feelings together to build EQ"
  ],
  twins_1y3m: [
    "👶 Walking confidence building - let them explore safely",
    "🗣️ First words emerging - repeat and encourage any sounds",
    "🧩 Problem-solving starting - simple puzzles develop thinking",
    "👥 Twin bond strengthening - they're learning from each other",
    "🍎 Feeding independence growing - let them self-feed when possible",
    "📖 Story time magic - reading together builds language and bonding"
  ]
};

/**
 * Work/life balance wisdom
 */
const BALANCE_MESSAGES = [
  "Your kids won't remember the deal you closed—they'll remember you were there. 👨‍👧‍👦",
  "Empire-building means nothing if you miss the kingdom at home. ⚖️",
  "Today: Be present. The businesses will survive an hour without you. 🏡",
  "Your children are your greatest ROI—invest time, not just money. 💎",
  "Hustle is good. Being dad is better. Balance both today. 🔥",
  "Three companies, one family. Prioritize accordingly. 👑",
  "Success at work, failure at home = failure. Lead both well today. 🎯",
  "Your kids are watching how you work—show them rest matters too. 🛋️",
  "Build wealth, but don't lose what money can't buy. Family first. ❤️"
];

/**
 * Get random scripture
 */
function getRandomScripture() {
  const random = Math.floor(Math.random() * FAITHFULNESS_VERSES.length);
  return FAITHFULNESS_VERSES[random];
}

/**
 * Get random kids tips (3 per child)
 */
function getKidsTips() {
  const caleb = getRandomSample(KIDS_DEVELOPMENT.caleb_6, 3);
  const bella = getRandomSample(KIDS_DEVELOPMENT.bella_4, 3);
  const twins = getRandomSample(KIDS_DEVELOPMENT.twins_1y3m, 3);
  
  return { caleb, bella, twins };
}

/**
 * Get random balance message
 */
function getBalanceMessage() {
  const random = Math.floor(Math.random() * BALANCE_MESSAGES.length);
  return BALANCE_MESSAGES[random];
}

/**
 * Helper: get random sample from array
 */
function getRandomSample(arr, count) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

/**
 * Get GRI business insights from yesterday
 */
async function getGRIInsights() {
  try {
    const SHOPIFY_STORE = process.env.SHOPIFY_STORE_DOMAIN || 'bdd19a-3.myshopify.com';
    const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '';
    
    // Calculate yesterday's date range (midnight to midnight AEST)
    const now = new Date();
    const aestOffset = 10 * 60 * 60 * 1000; // AEST = UTC+10
    const aestNow = new Date(now.getTime() + aestOffset);
    
    const yesterday = new Date(aestNow);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);
    
    const createdAtMin = yesterday.toISOString();
    const createdAtMax = yesterdayEnd.toISOString();
    
    console.log(`[Morning] Fetching GRI sales from ${createdAtMin} to ${createdAtMax}`);
    
    // Fetch orders from Shopify
    const url = `https://${SHOPIFY_STORE}/admin/api/2024-01/orders.json?status=any&created_at_min=${createdAtMin}&created_at_max=${createdAtMax}&limit=250`;
    
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_TOKEN,
        'Content-Type': 'application/json',
      }
    });
    
    if (!response.ok) {
      console.error('[Morning] Shopify API error:', response.status);
      return null;
    }
    
    const data = await response.json();
    const orders = data.orders || [];
    
    // Calculate metrics
    const totalSales = orders.reduce((sum, order) => sum + parseFloat(order.total_price || 0), 0);
    const orderCount = orders.length;
    
    // Find top product
    const productSales = {};
    orders.forEach(order => {
      (order.line_items || []).forEach(item => {
        const title = item.title || 'Unknown';
        if (!productSales[title]) {
          productSales[title] = { name: title, count: 0, revenue: 0 };
        }
        productSales[title].count += item.quantity;
        productSales[title].revenue += parseFloat(item.price) * item.quantity;
      });
    });
    
    const topProduct = Object.values(productSales)
      .sort((a, b) => b.count - a.count)[0] || null;
    
    // Find location spike
    const locationSales = {};
    orders.forEach(order => {
      const city = order.shipping_address?.city || order.billing_address?.city || 'Unknown';
      if (!locationSales[city]) locationSales[city] = 0;
      locationSales[city]++;
    });
    
    const topLocation = Object.entries(locationSales)
      .sort((a, b) => b[1] - a[1])[0];
    
    const locationSpike = topLocation && topLocation[1] >= 2 
      ? { city: topLocation[0], count: topLocation[1] }
      : null;
    
    return {
      totalSales,
      orderCount,
      topProduct,
      locationSpike,
      trend: orderCount > 0 ? `${orderCount} orders overnight - solid activity!` : null
    };
    
  } catch (e) {
    console.error('[Morning] GRI insights error:', e.message);
    return null;
  }
}

/**
 * Format GRI insights section
 */
function formatGRIInsights(data) {
  if (!data || data.orderCount === 0) {
    return "📊 *GRI OVERNIGHT*\n\n⚠️ No orders yesterday (or data unavailable)\n";
  }
  
  let section = "📊 *GRI OVERNIGHT*\n\n";
  section += `💰 $${data.totalSales.toFixed(2)} (${data.orderCount} orders)\n\n`;
  
  if (data.topProduct) {
    section += `🔥 *TRENDING:* ${data.topProduct.name} (${data.topProduct.count} sales)\n`;
    section += `   → Focus: Push this product today!\n\n`;
  }
  
  if (data.locationSpike) {
    section += `📍 *LOCATION SPIKE:* ${data.locationSpike.city} (${data.locationSpike.count} orders)\n`;
    section += `   → Target: More ads in this region\n\n`;
  }
  
  if (data.trend) {
    section += `📈 *TREND:* ${data.trend}\n`;
  }
  
  return section;
}

/**
 * Send wake-up via Telegram
 * Uses the Pablo briefing bot (griapitest_test_bot)
 */
async function sendTelegram(text, chatId) {
  try {
    // Pablo briefing bot token
    const BOT_TOKEN = '8578276920:AAFuoogSGgrA0QZyb17pm5FttNNIiuOXGqc';
    
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        chat_id: chatId, 
        text, 
        parse_mode: 'Markdown'
      })
    });
    
    if (!response.ok) {
      console.error('[Morning] Telegram send failed:', response.status);
    }
  } catch (e) {
    console.error('[Morning] Telegram error:', e.message);
  }
}

/**
 * Generate and send morning wake-up
 */
export async function sendMorningWakeUp() {
  console.log('[Morning] Generating wake-up message...');
  
  try {
    const date = new Date().toLocaleDateString('en-AU', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      timeZone: 'Australia/Brisbane'
    });
    
    const scripture = getRandomScripture();
    const kidsTips = getKidsTips();
    const balanceMsg = getBalanceMessage();
    const griData = await getGRIInsights();
    
    // Build message
    let message = `☀️ *GOOD MORNING JOSH*\n\n`;
    message += `_Today is the day the LORD has made; rejoice and be glad in it!_\n`;
    message += `📅 ${date}\n\n`;
    
    message += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    // Scripture
    message += `📖 *MORNING SCRIPTURE*\n\n`;
    message += `_"${scripture.verse}"_\n`;
    message += `— ${scripture.reference}\n\n`;
    
    message += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    // Kids
    message += `👨‍👧‍👦 *YOUR KIDS TODAY*\n\n`;
    
    message += `*Caleb (6) 👦*\n`;
    kidsTips.caleb.forEach(tip => message += `${tip}\n`);
    message += `\n`;
    
    message += `*Bella (4) 👧 (Sanguine)*\n`;
    kidsTips.bella.forEach(tip => message += `${tip}\n`);
    message += `\n`;
    
    message += `*Matteo & Chloe (1y 3m) 👶👶 (Twins)*\n`;
    kidsTips.twins.forEach(tip => message += `${tip}\n`);
    message += `\n`;
    
    message += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    // Balance
    message += `⚖️ *WORK/LIFE BALANCE*\n\n`;
    message += `${balanceMsg}\n\n`;
    
    message += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    // GRI insights
    message += formatGRIInsights(griData);
    
    message += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    message += `💪 *Go make today count, King.*\n\n`;
    message += `— Pablo 🤖`;
    
    // Send to Josh
    await sendTelegram(message, JOSH_CHAT);
    
    console.log('[Morning] Wake-up sent to Josh');
    
    return { ok: true, message };
    
  } catch (e) {
    console.error('[Morning] Wake-up generation failed:', e.message);
    await sendTelegram(`❌ Morning wake-up failed: ${e.message}`, JOSH_CHAT);
    return { ok: false, error: e.message };
  }
}

/**
 * Calculate ms until next 5am AEST
 */
function msUntil5amAEST() {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(19, 0, 0, 0); // 5am AEST = 19:00 UTC (AEST is UTC+10, no DST in Queensland)
  if (target <= now) target.setUTCDate(target.getUTCDate() + 1);
  return Math.max(0, target.getTime() - now.getTime());
}

/**
 * Start morning wake-up scheduler
 */
let wakeUpActive = false;

export function startMorningWakeUp() {
  if (wakeUpActive) return;
  wakeUpActive = true;

  const schedule = () => {
    const msUntil = msUntil5amAEST();
    const nextRun = new Date(Date.now() + msUntil);
    console.log(`[Morning] Next wake-up: ${nextRun.toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })} AEST`);
    
    setTimeout(async () => {
      await sendMorningWakeUp();
      schedule(); // Reschedule for tomorrow
    }, msUntil);
  };

  schedule();
  console.log('[Morning] ☀️ Wake-up scheduler active — fires at 5:00am AEST daily');
}
