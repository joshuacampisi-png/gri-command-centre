# Google Search Console Integration Setup

**Purpose:** Pull CTR, impressions, rankings, and clicks data to measure SEO change impact.

---

## Step 1: Enable Search Console API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project: "GRI Command Centre"
3. Enable API: **Google Search Console API**
   - Go to "APIs & Services" → "Enable APIs and Services"
   - Search "Search Console API"
   - Click "Enable"

---

## Step 2: Create Service Account

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "Service Account"
3. Name: `gri-command-centre-seo`
4. Grant role: **Owner** (or Editor)
5. Click "Done"

---

## Step 3: Generate JSON Key

1. Click on the service account you just created
2. Go to "Keys" tab
3. Click "Add Key" → "Create New Key"
4. Choose **JSON**
5. Download the file

---

## Step 4: Add Service Account to Search Console

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Select property: `genderrevealideas.com.au`
3. Go to "Settings" (gear icon)
4. Under "Users and permissions" → "Add user"
5. Paste the service account email (from JSON file):
   ```
   gri-command-centre-seo@[project-id].iam.gserviceaccount.com
   ```
6. Set permission: **Owner**
7. Click "Add"

---

## Step 5: Add Credentials to Command Centre

1. Save the JSON key file:
   ```bash
   cp ~/Downloads/gri-command-centre-seo-xxxxx.json \
      /Users/wogbot/.openclaw/workspace/command-centre-app/credentials/google-search-console.json
   ```

2. Update `.env` file:
   ```bash
   GOOGLE_SEARCH_CONSOLE_KEY=/Users/wogbot/.openclaw/workspace/command-centre-app/credentials/google-search-console.json
   GOOGLE_SEARCH_CONSOLE_PROPERTY=sc-domain:genderrevealideas.com.au
   ```

---

## Step 6: Install Google API Client

```bash
cd /Users/wogbot/.openclaw/workspace/command-centre-app
npm install googleapis --save
```

---

## Step 7: Test Connection

Create test script:

```javascript
// test-search-console.js
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const credentials = JSON.parse(
  readFileSync('/Users/wogbot/.openclaw/workspace/command-centre-app/credentials/google-search-console.json', 'utf8')
)

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/webmasters.readonly']
})

const webmasters = google.searchconsole({ version: 'v1', auth })

async function test() {
  const res = await webmasters.searchanalytics.query({
    siteUrl: 'sc-domain:genderrevealideas.com.au',
    requestBody: {
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      dimensions: ['page'],
      rowLimit: 10
    }
  })
  
  console.log('Top 10 pages:', res.data.rows)
}

test().catch(console.error)
```

Run:
```bash
node test-search-console.js
```

---

## Step 8: Integrate with SEO Learning System

Update `seo-learning-system.js`:

```javascript
import { google } from 'googleapis'
import { readFileSync } from 'fs'

const GSC_KEY = process.env.GOOGLE_SEARCH_CONSOLE_KEY
const GSC_PROPERTY = process.env.GOOGLE_SEARCH_CONSOLE_PROPERTY

async function getSearchConsoleAuth() {
  const credentials = JSON.parse(readFileSync(GSC_KEY, 'utf8'))
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly']
  })
}

export async function fetchPagePerformance(page, startDate, endDate) {
  const auth = await getSearchConsoleAuth()
  const webmasters = google.searchconsole({ version: 'v1', auth })
  
  const res = await webmasters.searchanalytics.query({
    siteUrl: GSC_PROPERTY,
    requestBody: {
      startDate,
      endDate,
      dimensions: ['page'],
      dimensionFilterGroups: [{
        filters: [{ dimension: 'page', expression: page }]
      }]
    }
  })
  
  const data = res.data.rows?.[0]
  
  return {
    page,
    impressions: data?.impressions || 0,
    clicks: data?.clicks || 0,
    ctr: data?.ctr || 0,
    avgPosition: data?.position || 0
  }
}
```

---

## Step 9: Schedule Monthly Performance Updates

Add to `seo-learning-cron.js`:

```javascript
// First day of each month at 6am - pull last month's data
cron.schedule('0 6 1 * *', async () => {
  const { updatePerformanceData } = await import('./seo-learning-system.js')
  await updatePerformanceData()
}, { timezone: 'Australia/Brisbane' })
```

---

## Repeat for Lionzen

1. Follow same steps for `lionzen.com.au`
2. Use same service account (add to both properties)
3. Update env vars:
   ```
   GOOGLE_SEARCH_CONSOLE_PROPERTY_LIONZEN=sc-domain:lionzen.com.au
   ```

---

## Data Flow

```
SEO change made → Logged to database
    ↓
30 days later → Cron job runs
    ↓
Fetch Search Console data for that page
    ↓
Compare: Before vs After CTR
    ↓
Update learning database
    ↓
Feed patterns back to SEO agents
```

---

## Next Steps

1. ✅ Complete Steps 1-5 (one-time setup in Google Cloud)
2. ✅ Add credentials file to Command Centre
3. ✅ Test connection
4. ✅ Integrate with learning system
5. ✅ Schedule monthly performance pulls
6. ✅ Connect Lionzen property

---

**Status:** Ready to implement. Needs Google Cloud account access to complete Steps 1-5.

**Owner:** Josh Campisi

**ETA:** 30 minutes once Google Cloud access is ready.
