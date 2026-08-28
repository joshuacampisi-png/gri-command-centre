# Valar Peptides — New Catalogue Manufacturing Brief

Prepared 2026-08-28. Full range for the new Valar Peptides catalogue, ranked 1-31 in
order of importance. NEW = first-time order, pricing and MOQ required.

Ranking basis: internal Peptide Demand 2026 market brief (prepared 2026-08-27,
Reddit-first community research plus wholesale vendor lane and adversarial
verification pass), cross-checked against the repo catalogue and P&L stocktake.
See provenance notes at the bottom.

---

## Copy-paste message

Hi team,

We are building out the new Valar Peptides catalogue (valarpeptides.com, Australia)
and this is the full range we need from you.

The list is ranked 1 to 31 in order of importance to us. Number 1 matters most. If
you cannot produce or ship the whole order at once, work down the list in this exact
sequence — do not substitute or reorder. Items marked NEW are first-time orders and
we need pricing and MOQ on each.

---

TIER 1 — RISING DEMAND
Fastest-growing lines. Increase volume against our last order. Produce these first.

 1. Retatrutide 20mg (RT20)
 2. Retatrutide 30mg (RT30)
 3. Retatrutide 10mg (RT10)
 4. KLOW 80mg (GHK-Cu + BPC-157 + TB-500 + KPV)
 5. GHK-Cu 100mg
 6. SS-31 10mg
 7. KPV 10mg — NEW
 8. KPV 20mg — NEW
 9. MOTS-C 10mg
10. Semax 10mg — NEW

TIER 2 — STRONG DEMAND
Proven, consistent high sellers. Keep deep stock. These must never run dry.

11. BPC-157 10mg
12. Wolverine 20mg (BPC-157 + TB-500)
13. GLOW 70mg (GHK-Cu + BPC-157 + TB-500)
14. TB-500 10mg standalone — REINTRODUCTION, previously discontinued
15. Selank 10mg — NEW
16. Semax + Selank blend 10mg — NEW
17. Semax + Selank blend 20mg — NEW
18. CJC-1295 DAC 5mg

TIER 3 — MEDIUM DEMAND
Steady sellers and range extensions. Moderate quantities.

19. Tesamorelin 20mg
20. NAD+ 500mg
21. Thymosin Alpha-1 10mg — NEW
22. HGH 24iu — NEW
23. HGH 36iu — NEW
24. Wolverine 30mg (BPC-157 + TB-500) — NEW
25. Wolverine 40mg (BPC-157 + TB-500) — NEW

TIER 4 — LOW DEMAND
Trial quantities only. Do not overstock — we will reorder if they move.

26. Pentadeca Arginate (PDA) 10mg — NEW
27. DSIP 10mg — NEW
28. Kisspeptin-10 10mg — NEW
29. GHRP-2 10mg — NEW
30. GHRP-6 10mg — NEW
31. Snap-8 10mg — NEW

---

ESSENTIALS — standing order, ships with every shipment

Not ranked, because they are not optional. Every shipment must include these in
quantities matched to the peptide volume in that shipment. An order that arrives
without them is unsellable.

- Bacteriostatic water 3ml
- B12 10mg — NEW
- Reusable dosing pen
- 3ml glass cartridge
- Needle heads (5 per kit)
- Syringe
- Carry case

---

SEPARATE QUOTE — not on the ranked list, we are deciding whether to add these

Please price these as well. We are evaluating them for the catalogue and need
numbers before we commit.

- Tirzepatide, all available strengths
- Semaglutide, all available strengths
- Cagrilintide, all available strengths
- Ipamorelin 5mg / 10mg
- PT-141 10mg
- Melanotan II 10mg
- MK-677 (oral)

---

Please come back with:

1. Unit price for every line above, plus volume price breaks.
2. MOQ on every item marked NEW and on the separate quote list.
3. Lead time per tier. We need Tier 1 and the Essentials first — confirm what you
   can have ready soonest.
4. COA for every batch, sent before dispatch. Batch-level COAs are non-negotiable
   for us and we will be sharing them with customers.
5. For GHK-Cu specifically, confirm injectable-grade material with COA. We will not
   accept repackaged cosmetic-grade.
6. Flag anything you cannot produce, so we can source it elsewhere rather than hold
   up the catalogue launch.

Thanks,
Josh
Valar Peptides

---

## Notes (internal — do not send)

### Provenance

Ranked against the internal Peptide Demand 2026 brief (2026-08-27): Reddit-first
community research plus a wholesale vendor lane and an adversarial verification pass
(six of eight load-bearing claims confirmed, two partially confirmed with corrections
applied). Cross-checked against the repo catalogue and P&L stocktake.

Two standing limitations:

- The brief is US-primary. Valar sells into Australia. Category demand should
  translate, but the regulatory drivers behind the GLP-1 surge (FDA closing the
  compounding pathways, displaced telehealth demand) are US-specific and do not
  map directly to an AU customer base.
- Still not Valar sales data. `nova-sales.json` on the Railway volume holds line-item
  qty, price, cost and margin per order via `server/lib/nova-sales-store.js`. Rank the
  13 existing products on real units and margin before committing to a large order.
  The brief settles category demand; only that file settles OUR demand.

### What the market brief changed, versus the previous draft

Two genuine errors in my ranking:

- SS-31 moved 24 -> 6. It is the single sharpest demand spike measured anywhere in
  the brief's research — all 25 sampled posts inside the last 3 months, 8 vendors
  already listing it, a repeated community protocol (SS-31 then MOTS-c) formed across
  4+ independent threads. Rated the top up-and-coming pick. We already stock it and I
  had it buried in Tier 3.
- TB-500 moved 27 -> 14. It ranks #6 retail / #7 wholesale in the top 20 with a
  regulatory tailwind from the July 2026 PCAC vote. I had it last-but-five on the
  reasoning that it sells inside Wolverine. That reasoning was wrong — standalone
  demand is real and it was discontinued against the market.

Other moves:

- GHK-Cu 14 -> 5. Now generates MORE daily discussion than BPC-157 in r/Peptides
  (1.78 vs 1.10 posts/day, identical query construction). The cosmetic/hair use case
  is the mover. Also carries a quality-arbitrage angle: heavy "is this legit" and
  cosmetic-vs-injectable-grade disputes mean verifiable injectable-grade COAs are a
  real differentiator, hence the explicit COA ask in the message.
- MOTS-C 23 -> 9. #5 by third-party mention share, rising, and it is the second half
  of the SS-31 protocol — an attach sell to rank 6.
- Semax 20 -> 10, and now ranks ABOVE the Semax+Selank blends. The brief ranks Semax
  #9 and Selank #12 as standalone products and does not identify a Semax+Selank blend
  as a market SKU. My previous draft elevated the blends over the singles on general
  "nootropics are growing" reasoning; the specific data says the singles are what
  people buy. Blends kept in Tier 2 because the blend-as-product thesis is one of the
  brief's central findings, but they no longer outrank the compounds they contain.
- PDA 11 -> 26. The brief puts it in the WATCH tier on the weakest volume in the whole
  up-and-coming set: 4 posts over 2 years. Its stated value is strategic — the
  substitute vendors pivot to if BPC-157 draws further restriction. "A hedge, not a
  bet." Trial quantity only. My original rank 3 for this was badly wrong; this is the
  third and final correction to it.
- DSIP 25 -> 27. Declining, and the single compound the FDA committee REJECTED in the
  July 2026 vote while recommending six others. User sentiment matches the vote.
- Thymosin Alpha-1 26 -> 21. #2 up-and-coming, rated medium-high, ~6.5 months of steady
  growth in a genuinely different customer segment (immune, not fitness). Foreign
  approval history as Zadaxin aids trust.
- HGH 9/10 -> 22/23. Ranked #20 and only stable, with demand diffuse across brand
  names and constant QC-complaint chatter about bad batches. Both are first-time
  orders for us, so a large first buy into a category with known batch-quality
  problems is the wrong risk. Start small, test the batch.
- Wolverine 30mg/40mg held at 24/25 as untested line extensions.
- GHRP-2, GHRP-6, Snap-8 confirmed Tier 4 — absent from the top 20, the up-and-coming
  tier and the watchlist entirely. Kisspeptin-10 is watchlist-only (one strong
  technical thread), so 28 is right.

### Adds the brief argues for, now on the separate quote list

- Tirzepatide (#2) and Semaglutide (#3). The growth driver is regulatory: the FDA has
  closed both legal mass-compounding pathways, and displaced telehealth demand is
  flowing into exactly the research-peptide channel we sell into. Caveat: that is a US
  mechanism and we are AU.
- Cagrilintide (#14). Retatrutide's default companion with 10 months of sustained
  growth and a forming "RetaCagri" blend culture. This is the attachment sell onto our
  own number 1 — the single highest-leverage add on the list.
- Ipamorelin. CJC-1295 + Ipamorelin is the default beginner stack and, per the brief,
  the two are never discussed separately. We stock CJC-1295 DAC alone, so we are
  selling half a stack and losing the attach on every unit.
- PT-141 (#17) and Melanotan II (#16). Both top-20 and stable. PT-141 was previously
  stocked and discontinued — worth revisiting on this evidence.
- MK-677 (#19). Wholesale portfolio staple.

### Naming — fix before the catalogue goes live

The community's naming is precise and we are slightly off it. "Wolverine" means
BPC-157 + TB-500 ONLY. Add GHK-Cu and it is GLOW. Add KPV and it is KLOW. Our product
is composed correctly but is listed as "Wolverine+" — drop the plus so search and
word-of-mouth land on our page. Retatrutide is "Reta", "Triple-G" or "Godzilla" in
the wild.

### Retatrutide risk — Josh's call, not a stocking decision

Retatrutide is our number 1 and also the compound drawing direct legal fire at
sellers in our exact category. Eli Lilly announced six lawsuits on 12 Aug 2026
(verified across NPR, CBS, CNBC, Washington Post, FiercePharma) over retatrutide
specifically — four online RUO peptide sellers, one med spa, one compounding pharmacy.

The brief's recommendation is to keep retailing it, adopt the surviving market's
coded-SKU convention on public-facing surfaces, hold the COA story tight on this SKU,
and get a legal read before leaning in harder via wholesale, advertising or bundles.

Note we are already aligned on the coded-SKU point: our public naming is RT10 / RT20 /
RT30, which matches the "R-30" convention surviving vendors have moved to. Keep it
that way on the site and in ads.

### Open items to confirm before sending

- Thymosin Alpha-1 vial size assumed 10mg to match the range; 5mg is equally standard.
- GHRP-2 and GHRP-6 had no strength specified; 10mg assumed as the standard vial.
- Wolverine 30mg and 40mg are new strengths of the same BPC-157 + TB-500 blend. If the
  ratio changes at higher strengths, specify it.
- NEW is set against the P&L stocktake, not the price list. KPV and HGH appear on the
  white price list but were never ordered, so both are genuinely NEW.
- Wholesale MOQ benchmark from the brief is 20-100 vials (2-10 kits) if we ever open
  that channel — useful context when reading the manufacturer's MOQ numbers back.
- Price lists and the catalogue page in this repo are still branded NovaPeptides /
  NovaPeptidesAustralia.com and need a rebrand pass to Valar Peptides.
