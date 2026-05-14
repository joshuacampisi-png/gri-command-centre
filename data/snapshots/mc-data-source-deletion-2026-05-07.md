# Merchant Center Data Source Deletion — May 7 2026

## Action taken
Deleted broken legacy "Reveal Cannon" data source from Google Merchant Center → Data sources → Product review sources.

## Deletion details
- **Source name:** Reveal Cannon
- **Type:** File (URL)
- **Content:** Product reviews
- **File URL:** `https://genderrevealideas.com.au/products/gender-reveal-powder-cannon-63cm-powder-only`
- **Schedule:** Every 24 hours at 12:00 AM
- **Total reviews ever loaded:** 0 (zero)
- **Recent error:** XML formatting error (consistent across all visible update history)
- **MC data source ID:** 10346849730

## Why deleted
1. Feed was misconfigured — pointing to a single Shopify product PDP URL (HTML), not an XML reviews feed
2. Failing daily with XML formatting error for at least 8+ days (likely much longer)
3. Status: inactive, 0 reviews loaded
4. Blocking Judge.me's Awesome plan from establishing its own Content API submission
5. Judge.me's own warning explicitly identified this conflict ("We have noticed you may already have a product review source connected")

## Why this was safe
- No reviews to lose (0 ever loaded)
- Product listings unaffected (separate data source type)
- Schema.org rich snippets on product pages unaffected (driven by Judge.me widget, not MC)
- Judge.me dashboard data unaffected
- Shopify metafields unaffected (4.85★-5.0★ ratings still on products)

## Verified post-deletion
- Product review sources tab shows "No results" (clean slate)
- Products tab shows ~300 approved + ~50 limited (no drop)
- Chart confirms steady product approval status through deletion timestamp

## Forward expectations
- 24-48h: Judge.me Awesome plan establishes new Content API source
- 2-7 days: Google approves Judge.me feed
- 5-14 days: stars appear on Shopping listings
- Earliest visible: May 9-10
- Latest reasonable: May 21

## Sources verifying decision
- Direct inspection of MC Data sources page (screenshots in browser)
- Judge.me settings dashboard (Awesome plan active, Google Shopping ON)
- Shopify metafields query (1,354 reviews exist, 4.19 avg rating)
- 4 SERP scans (smoke bomb, cannon, tnt australia, powder blaster) confirming no GRI stars currently

## What to verify on May 9-10
- Login MC → Data sources → Product review sources
- Should see new entry (likely "Judge.me" or similar) with reviews loaded > 0
- If still empty by May 12 → Judge.me support ticket needed
