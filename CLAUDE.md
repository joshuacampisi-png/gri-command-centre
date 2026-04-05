# Command Centre — Claude Rules

## Deploy
- Railway auto-deploys on `git push origin main`. Always run `npm run build` before committing so `dist/` is current.
- Commit `dist/` — Railway serves the built frontend from there.
- Never commit `data/` (runtime JSON, uploaded media).

## Meta / Ads
- Meta token is **hardcoded** in `server/lib/meta-api.js` as `HARDCODED_META_TOKEN`. It takes priority over `process.env.META_ACCESS_TOKEN` because Railway has a stale env var we can't edit. Replace the hardcoded token when it expires (60-day extended tokens).
- Ad account: `act_1519116685663528`. Campaign IDs live in the same file.
- Always use `metaToken()` helper in routes — never read `process.env.META_ACCESS_TOKEN` directly.
- Meta `last_Xd` preset = X days ending **yesterday** (does not include today). Shopify queries for ads metrics must match this window exactly, otherwise MER is inflated.

## Shopify Revenue Accuracy
- Use `order.total_price` **minus refund transaction amounts** — matches Shopify's "Total sales" metric. Do not count `total_price` alone; partially refunded orders will over-report.
- Filter out `financial_status === 'voided'` and `cancelled_at !== null`.
- For AEST dates use `Intl` with `timeZone: 'Australia/Brisbane'` (always +10, no DST). Do not hardcode `+10` hours — that breaks during AEDT in Sydney timezone stores.

## Ads Command Centre — Health & Recommendations
- Campaign health score comes from `calculateCampaignHealth()` in `server/lib/ads-metrics.js` — scores on **CPP vs $26 profitable / $31.50 breakeven**, volume, and frequency. **Not** ad fatigue averages.
- Health scoring is **portfolio-aware**: campaigns contributing >25% of total revenue get a score boost to prevent culling revenue pillars ($10k/week survival logic).
- Surgical actions (ad-set and ad level) come from `generateSurgicalActions()`. Actions are: `PAUSE`, `SCALE_BUDGET`, `REDUCE_BUDGET`, `REPLACE_CREATIVE`, `REFRESH_AUDIENCE`, `PROTECT`. Each has priority URGENT/HIGH/MEDIUM/LOW and a projected impact string.
- Never recommend "cull entire campaign" by default — drill to the specific ad or ad set responsible.

## GRI Business Constants (hardcoded)
- AOV: $105, Gross margin: 30%, Gross profit/order: $31.50
- Breakeven CPP: $31.50, Profitable CPP: $26.00
- Target MER: 4.0x, Scale MER: 6.0x

## Instagram Scheduler
- Media files auto-cleanup after publish (`instagram-cron.js` → `cleanupPostMedia`). Startup cleanup runs for already-published posts.
- Delete endpoint removes files from disk (not soft-archive) to prevent Railway disk full.
- Date/time input uses separate `scheduleInput` local state with regex validation — do not bind the datetime-local value to a derived IIFE, it causes glitch/snap-back.

## Google Ads Agent (built 2026-04-04)
- Lives at `server/lib/gads-*.js` + `server/routes/gads-agent.js` + `src/components/GoogleAdsAgentTab.jsx`. Tab sits at NAV position 11 between Ads Flywheel and Ads Testing. Mirrors the Meta Flywheel pattern — do **not** rebuild it in Next.js/Supabase, that was the original spec and it was rejected.
- **Supervised autonomy only.** Agent proposes, Josh approves per card, then it executes via `google-ads-api` v23. Never full-autonomous. The only action the agent takes without approval is the 7-day auto-revert if projected impact didn't materialise at 40%+.
- **Dry-run is ON by default** (`data/gads-agent/config.json` → `dryRun: true`). Every mutation in `gads-mutations.js` checks `isDryRun()` first. Only flip `dryRun: false` via the Thresholds tab when Josh explicitly says so.
- **GRI Google Ads economic constants are separate from the Meta/Shopify constants above.** Google Ads uses AOV $108 / 47% margin / $49.35 breakeven CPP / 3.0x target ROAS. Meta uses $105 / 30% / $31.50. Do not unify them — different channels, different unit economics. These live in `data/gads-agent/config.json`.
- **Customer IDs:** `GOOGLE_ADS_CUSTOMER_ID=9431746480` (ad account), `GOOGLE_ADS_LOGIN_CUSTOMER_ID=7718781566` (MCC). The MCC login is **required** — the v23 client fails without it because GRI sits under the MCC.
- **Claude budget guard:** every AI call in `gads-agent-intelligence.js` routes through `claude-guard.js`. AI enrichment is **capped at the top 5 findings per scan** to protect the $10/day cap. Findings 6+ get deterministic template copy. Do not lift this cap without also raising `CLAUDE_DAILY_BUDGET_USD`.
- **Rules engine thresholds (from the grill-me decision log):** keyword bleed $35, campaign bleed $75 over 5 days, zero-impression cutoff 14 days, reallocation trigger 0.8x/1.4x ROAS, negative keyword candidate 3+ clicks with <2% CTR. All editable from the Thresholds tab — do not hardcode new thresholds in JS.
- **Smart cadence:** hourly scans 6am-9pm AEST, 10pm and 2am overnight scans, 6am daily intelligence briefing, 7am daily accuracy check + revert sweep. Timezone is `Australia/Brisbane` (no DST). Boot-time API ping runs 10s after server start.
- **Auto-revert coverage:** pause campaign, pause keyword, add negative keyword — fully auto-revertable. Bid increases require manual intervention (previous bid micros aren't snapshotted). If you add new mutation types, make sure the revert path is covered in `gads-agent-revert.js`.
- **Test script:** `scripts/test-google-ads.js` is the canonical credential verification. Run it after any env var or OAuth change before assuming the agent is healthy.
- **Frontend verification:** after any tab change, run `npm run build` before `npm run preview` — the preview command serves stale `dist/` not live source. `command-centre-ui` launch config runs `vite preview`, not `vite dev`.
- Full decision log and architectural rationale lives in memory at `project_google_ads_agent.md`.

## Conventions
- Dashboard reports to Josh (owner) — keep outputs short, no fluff, no emojis in code.
- Australian English in user-facing copy.
- Always QA live pushes before declaring complete.
