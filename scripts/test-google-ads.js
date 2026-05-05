// Google Ads API connection test
// Run with: node scripts/test-google-ads.js
// Pulls last 7 days of campaign performance from the GRI ad account

import 'dotenv/config';
import { GoogleAdsApi } from 'google-ads-api';

const {
  GOOGLE_ADS_DEVELOPER_TOKEN,
  GOOGLE_ADS_CLIENT_ID,
  GOOGLE_ADS_CLIENT_SECRET,
  GOOGLE_ADS_REFRESH_TOKEN,
  GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  GOOGLE_ADS_CUSTOMER_ID,
} = process.env;

const missing = [
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'GOOGLE_ADS_CLIENT_ID',
  'GOOGLE_ADS_CLIENT_SECRET',
  'GOOGLE_ADS_REFRESH_TOKEN',
  'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
  'GOOGLE_ADS_CUSTOMER_ID',
].filter((k) => !process.env[k]);

if (missing.length) {
  console.error('Missing env vars:', missing.join(', '));
  process.exit(1);
}

console.log('Connecting to Google Ads API...');
console.log('  MCC (login):', GOOGLE_ADS_LOGIN_CUSTOMER_ID);
console.log('  Ad account:', GOOGLE_ADS_CUSTOMER_ID);
console.log('');

const client = new GoogleAdsApi({
  client_id: GOOGLE_ADS_CLIENT_ID,
  client_secret: GOOGLE_ADS_CLIENT_SECRET,
  developer_token: GOOGLE_ADS_DEVELOPER_TOKEN,
});

const customer = client.Customer({
  customer_id: GOOGLE_ADS_CUSTOMER_ID,
  login_customer_id: GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  refresh_token: GOOGLE_ADS_REFRESH_TOKEN,
});

try {
  const rows = await customer.query(`
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.conversions_value
    FROM campaign
    WHERE segments.date DURING LAST_7_DAYS
    ORDER BY metrics.cost_micros DESC
  `);

  if (!rows.length) {
    console.log('Connection successful, but no campaign data returned for last 7 days.');
    console.log('(This is unusual — R6 Digital typically runs continuous ads.)');
    process.exit(0);
  }

  console.log(`Connection successful. Found ${rows.length} campaign row(s) for last 7 days:\n`);

  let totalCostAud = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalConversions = 0;
  let totalConversionValue = 0;

  for (const row of rows) {
    const name = row.campaign?.name || '(unknown)';
    const status = row.campaign?.status || '-';
    const costAud = (Number(row.metrics?.cost_micros || 0)) / 1_000_000;
    const impressions = Number(row.metrics?.impressions || 0);
    const clicks = Number(row.metrics?.clicks || 0);
    const conversions = Number(row.metrics?.conversions || 0);
    const convValue = Number(row.metrics?.conversions_value || 0);

    totalCostAud += costAud;
    totalImpressions += impressions;
    totalClicks += clicks;
    totalConversions += conversions;
    totalConversionValue += convValue;

    console.log(`  [${status}] ${name}`);
    console.log(`    Cost: $${costAud.toFixed(2)} | Impr: ${impressions} | Clicks: ${clicks} | Conv: ${conversions.toFixed(2)} | ConvValue: $${convValue.toFixed(2)}`);
  }

  console.log('\n--- 7-day totals ---');
  console.log(`Spend:        $${totalCostAud.toFixed(2)} AUD`);
  console.log(`Impressions:  ${totalImpressions}`);
  console.log(`Clicks:       ${totalClicks}`);
  console.log(`Conversions:  ${totalConversions.toFixed(2)}`);
  console.log(`Conv. value:  $${totalConversionValue.toFixed(2)}`);
  console.log(`ROAS:         ${totalCostAud > 0 ? (totalConversionValue / totalCostAud).toFixed(2) + 'x' : 'n/a'}`);
  console.log(`Avg CPC:      ${totalClicks > 0 ? '$' + (totalCostAud / totalClicks).toFixed(2) : 'n/a'}`);
  console.log('\nGoogle Ads API is live and returning real data.');
} catch (err) {
  console.error('\nGoogle Ads API call failed:');
  console.error(err?.errors || err?.message || err);
  process.exit(1);
}
