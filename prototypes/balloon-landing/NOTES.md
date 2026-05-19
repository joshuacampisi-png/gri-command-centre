# Balloon Landing Prototype — Handoff Notes

Standalone HTML/CSS/JS prototype for a helium number balloon product page.
Deployable as a static site to Vercel. Will later be ported into the Shopify
storefront (genderrevealideas.com.au) as a product page or custom template.

## Brand & scope
- Brand: Gender Reveal Ideas (genderrevealideas.com.au)
- Page title: "Gender Reveal & Party Balloons"
- Product: helium-inflated birthday number balloons + balloon bundle
- Service area: Brisbane, Gold Coast & surrounds
- Layout reference: https://genderrevealideas.com.au/products/single-arch-balloon-garland (couldn't fetch from sandbox — needs verification)

## Files
- `index.html` — full page markup
- `styles.css` — soft cream + dusty pink palette, Playfair/Inter fonts
- `script.js` — AEST date logic, form state, summary, CTA validation
- `assets/placeholder-*.svg` — temporary art, swap with real product photos
- `vercel.json` — clean URLs config

## Funnel implemented
1. Pick 1 or 2 number balloons (pill toggle)
2. Bundle card: 1 Number + Bundle / 2 Numbers + Bundle (auto-syncs with step 1)
3. Digit pickers (0–9 dropdowns, second digit revealed for 2-number bundle)
4. Colour swatches: Pink, Blue, Gold, Silver (placeholders)
5. Pickup or Delivery toggle (hint copy adjusts)
6. Date + Time picker with rules:
   - Same-day AEST: 7am–2pm window, min 1hr lead time from now
   - After 2pm AEST: same-day disabled, earliest is tomorrow
   - Other days: 7am–6pm pickup hours, 15-min slots
   - Brisbane fixed at UTC+10 (no DST)
   - Info "i" button reveals the rules inline
7. Live order summary
8. CTA: "Order My Balloons" (currently `alert()` payload — wire to Shopify cart later)

## Outstanding TODOs
- [ ] Pull real product images from the Google Drive folder
      https://drive.google.com/drive/folders/13hUhaq60tGovEV-DOdzuTAloNjaqcAgE
      (was blocked by this session's network policy)
- [ ] Confirm the 4 actual colour names + hex values
- [ ] Fill in pricing (left as `$XX.XX` placeholder)
- [ ] Confirm pickup studio address (Brisbane location)
- [ ] Confirm delivery suburb list + fee structure
- [ ] Verify the reference page layout once site is reachable
      (https://genderrevealideas.com.au/products/single-arch-balloon-garland)
- [ ] Wire CTA to Shopify cart (`/cart/add.js`) or checkout permalink
- [ ] Port to Shopify Liquid section once design is approved

## Preview locally
```
cd prototypes/balloon-landing
python3 -m http.server 8000
```
Open http://localhost:8000

## Deploy to Vercel
```
cd prototypes/balloon-landing
vercel deploy        # preview URL
vercel --prod        # production URL
```

## Why this lives in a separate folder
Standalone so it can be deployed to Vercel without touching the Command Centre
build, and easier to lift into Shopify later. Not wired into the Express app.
