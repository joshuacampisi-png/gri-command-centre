# Peptide Tests Australia (PTA) — one-page site

A self-contained, static one-page website for **Peptide Tests Australia (PTA)** — an
independent peptide purity-testing service (front-of-house; testing is subcontracted to
a verified TGA-approved partner lab).

## What's here

```
pta-site/
├── index.html          One-page site: hero, pain points, how-it-works, pricing,
│                        COA/trust, live booking flow, blog cards, FAQ, footer
├── styles.css          Design system (medical/pharma palette + 2026 brand accent)
├── script.js           Live pricing calculator, booking flow, FAQ, nav, scroll reveals
├── terms.html          Terms & Conditions (placeholder copy)
├── privacy.html        Privacy Policy (placeholder copy)
├── blog/
│   ├── fake-peptides-taking-over-australia.html
│   ├── 15000-aussies-1-to-15-percent-purity.html
│   └── how-to-read-your-peptide-coa.html
└── assets/             Placeholder graphics (inline-style SVGs — swap for real photography)
    ├── coa.svg         Sample Certificate of Analysis mockup (hero + trust section)
    ├── blog-boom.svg   Blog thumbnail
    ├── blog-purity.svg Blog thumbnail
    └── blog-coa.svg    Blog thumbnail
```

No build step, no dependencies, no external requests — open `index.html` in a browser,
or serve the folder statically:

```bash
cd pta-site && python3 -m http.server 8080   # then visit http://localhost:8080
```

## Pricing logic (stacking 15% discount)

Base rate **$350/vial**. Each batch tier stacks another **15%** off the per-vial price
(`perVial = 350 × 0.85^steps`), where steps = 0/1/2/3 for 1/2/5/10 vials:

| Vials | Per vial   | Total    | Discount |
|-------|-----------|----------|----------|
| 1     | $350.00   | $350.00  | base     |
| 2     | $297.50   | $595.00  | 15%      |
| 5     | $252.88   | $1,264.38| ~28%     |
| 10    | $214.94   | $2,149.44| ~39%     |

Logic lives in `script.js` (`price()` / `updateSummary()`) and drives the live order
summary. Change `BASE_PER_VIAL` or `STEP` there to retune.

## Placeholders to finalise before going live

- **Brand name** — "Peptide Tests Australia / PTA" is a working name.
- **Images** — all graphics are generated SVG placeholders; swap for real lab photography.
- **Lab postage address** — placeholder PO Box in the booking confirmation.
- **Legal** — Terms & Privacy contain `placeholder`-highlighted gaps (ABN, lab
  accreditation numbers, refund policy, payment provider) for legal review.
- **Booking backend** — the form is front-end only. It validates, generates a local
  reference (`PTA-YYMM-XXXX`) and shows a confirmation. Wire the submit handler in
  `script.js` to a real booking/payment endpoint before launch (marked with a comment).
- **Stats** — "15,000+ Aussies" and "6 years" are the requested marketing figures;
  confirm/qualify before publishing.

## Notes

- Copy is Australian English, pain-point led, and frames PTA as independent testing only
  (not a peptide seller) — see the disclaimer in the footer and legal pages.
- This site is standalone and does **not** touch the existing Command Centre app.
