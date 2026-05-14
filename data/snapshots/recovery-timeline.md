# GRI Google Ads Recovery Timeline

## The chronological record of every change April 14 onward

### Apr 12 2026 — last clean day pre-surgery
- ROAS 3.11x (14-day avg Mar 30 - Apr 12)
- $784/d revenue · 7.55 conv/d · $104 AOV
- Bundles: empty productType, empty SEO title, ranking via title + tags + history
- Singles: most had productType filled (e.g. "Gender Reveal > Smoke Bombs"), some had SEO titles
- 4-6 of 8 carousel slots typically owned

### Apr 14 — SURGERY (the original mistake)
**Action:** `scripts/shopping-feed-optimise.js` — bulk update on 102 products
- Added productType to most products (including singles that had it, plus bundles that didn't)
- Added keyword-stuffed SEO titles like "Gender Reveal Powder Cannon Pink Blue 4 Pack Bundle Australia | Gender Reveal Ideas"
- google_product_category, condition=new, age_group=adult set on most

**Result:** Initial impression spike (~95K imps Apr 14, vs ~12K baseline). ROAS started declining within 48h.

### Apr 14-26 — DECLINE
- Apr 14-19: ROAS 1.5-2.5x range (volatile)
- Apr 22: 5.13x (anomaly day, low spend)
- Apr 23: 1.24x
- Apr 24: 0.73x ← bottom
- Apr 25: 0.90x
- AOV crashed -32% from $104 to ~$66

### Apr 27 — FIRST REVERT (the second mistake)
**Action:** `scripts/revert-major-damage.js` — cleared SEO title + productType on 61 products
- 61 of 102 products reverted to empty productType + empty SEO title
- Did NOT perfectly restore Apr 13 state (some products had productType pre-surgery, the revert went too far)
- Did NOT touch the other 41 products' SEO titles

**Result:** Triggered second PMAX learning reset. ROAS oscillated 1.6-2.9x range Apr 27 - May 4.

### Apr 27-May 4 — PARTIAL RECOVERY (false signal)
- Apr 27: 1.97x (revert day)
- Apr 28: 2.85x ← peak post-revert
- Apr 29: 2.15x
- Apr 30: 1.79x
- May 1: 2.91x
- May 2: 1.74x
- May 3: 1.63x
- May 4: 1.25x

7-day avg ROAS 1.95x. 14-day avg 2.07x. **Stuck at ~67% of pre-surgery, no clear recovery curve.**

### May 4 ~10:55pm AEST — PHASE 2 (cautious extension)
**Action:** `scripts/phase2-bundle-restore.js` — restore productType + SEO title + custom_label_0 + GPC on 5 hero bundles
- Targets: 4x Bundle Pack Smoke Bombs, Cannon & Ext Double Bundle, Powder Ext Bundle, Race Day Reveal Bundle, TNT Self Hire
- Theory: structured signals + custom label segmentation will restore Google's bundle matching

**Result:** May 5 closed 3.31x ROAS but Phase 2 had only 1h of exposure — that day's lift was PMAX learning noise from earlier, not Phase 2.

### May 5 ~10:50pm AEST — PHASE 2 EXPANSION (the bulk extension)
**Action:** `scripts/phase2-expand-bundles.js` — same restore on 38 more real bundles
- Targets: 38 of remaining 55 bundles (excluded 18 non-bundle items: [FREE] gifts, scratchies, accessories, non-GR themed sets)
- Total tagged bundles: 43 of 60

**Result:** 38/38 successful. No data yet (Google needs 24-48h re-crawl).

### May 5 ~02:18am AEST — PATH C HYBRID REVERT (this entry)
**Action:** `scripts/path-c-hybrid-revert.js` — roll back productType + SEO title to EMPTY on all 43 tagged bundles. KEEP custom_label_0 = bundle_premium and google_product_category intact.

**Rationale:**
- Pre-surgery (3.11x ROAS) had empty productType + empty SEO title on bundles
- Path A (keep tonight's structure) risks recreating Apr 14 query-mix shift
- Path B (full revert) kills cannibalisation segmentation lever needed for May 12
- Path C threads the needle: query-matching state matches pre-surgery; segmentation lever (custom_label_0) retained for May 12 cannibalisation kill
- Empirical-best (pre-surgery worked) > theoretical-best (industry consensus)

**Sources:**
- Google MC docs: custom_label is filter-only, not relevance signal
- smarter-ecommerce (Mike Ryan): custom labels for PMAX segmentation
- Optmyzr 2026: stop direction-changing fields if results not recovering
- Solutions 8: revert mid-learning if fix isn't reading

**Result:** 43/43 reverted successfully. State now matches pre-surgery query-matching configuration on bundles.

### Forward schedule

| Date | Action |
|---|---|
| May 6 | Daily monitoring, no changes |
| May 7 evening | First read post-Path-C (Google ~24h re-crawl) |
| May 8 morning | Re-scan stars on Shopping SERP (Judge.me Awesome day 11) |
| May 11 evening | 7-day Path C read window closes |
| **May 12 morning** | **Decision day:** if ROAS ≥2.5x → ship cannibalisation kill (PMAX listing group filters) + Phase 3 (tROAS floors on All Products + Bundles, lower Cannon & Powder 200% → 170%) |
| May 12 evening | Verify cannibalisation kill via product-to-campaign overlap report |
| May 19 | Single SKU productType phase if Phase 2/3/cannibalisation working |
| TBD | Sam Piliero hero-SKU framework when PDF arrives |
| TBD | Lifestyle imagery + PMAX asset group strength → Excellent |

## Snapshots index

| File | Purpose |
|---|---|
| `shopify-snapshot-2026-04-27.json` | Apr 27 product state (post-Apr-14, pre-Apr-27-revert) |
| `revert-log-2026-04-27.json` | Apr 27 revert before/after for 61 products |
| `phase2-bundles-may19-reference.json` | May 4 pre-Phase-2 state of 5 hero bundles |
| `phase3-bid-strategy-may19-reference.json` | May 4 bid strategy snapshot |
| `phase2-execution-log.json` | May 4 Phase 2 mutation log |
| `phase2-expand-pre-snapshot.json` | May 5 pre-expansion state of 38 bundles |
| `phase2-expand-execution-log.json` | May 5 Phase 2 expansion mutation log |
| `path-c-pre-revert-2026-05-05.json` | May 5 pre-Path-C state of 43 bundles |
| `path-c-execution-2026-05-05.json` | May 5 Path C mutation log |
