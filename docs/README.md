# NovaPeptides — Cost & Profit Dashboard

Combined landed-cost stocktake and P&L for NovaPeptides.com.au.

## Files
- **`profit-loss-dashboard.html`** — open in any browser. Branded dashboard with live
  margin calculator. Enter your AUD retail prices (and today's USD→AUD rate) to see
  profit per vial, margin %, stock value and potential profit. Print to PDF for records.
- **`novapeptides-stocktake.csv`** — same data for Excel / Google Sheets. Editable
  retail column with live formulas.

## Method
Both orders are pooled into one. All freight ($320) is spread across all products by
their share of the goods value (standard landed-cost allocation), so the cost per vial
includes shipping.

- Goods (both orders): **$1,011.20**
- Freight (both orders): **$320.00**
- Total landed cost: **$1,331.20 USD** — multiplier = 1,331.20 ÷ 1,011.20 = **×1.3165**
- Reconciles to both supplier totals: $993.60 + $337.60 = $1,331.20

### Profit per sale — best to lowest (rate 1.45, kit extras A$6)
| # | Product | Type | Cost | Retail | Profit | Margin |
|---|---|---|---|---|---|---|
| 1 | Reta 60mg | Full kit | A$53.34 | A$399 | **A$345.66** | 87% |
| 2 | Reta 60mg | Vial only | A$47.34 | A$320 | **A$272.66** | 85% |
| 3 | KLOW 80mg | Full kit | A$45.09 | A$230 | **A$184.91** | 80% |
| 4 | GLOW 70mg | Full kit | A$39.13 | A$219 | **A$179.87** | 82% |
| 5 | KLOW 80mg | Vial only | A$39.09 | A$195 | **A$155.91** | 80% |
| 6 | BPC-157 + TB-500 | Full kit | A$23.11 | A$170 | **A$146.89** | 86% |
| 7 | GLOW 70mg | Vial only | A$33.13 | A$179 | **A$145.87** | 81% |
| 8 | SS-31 10mg | Full kit | A$20.96 | A$130 | **A$109.04** | 84% |
| 9 | BPC-157 + TB-500 | Vial only | A$17.11 | A$120 | **A$102.89** | 86% |
| 10 | SS-31 10mg | Vial only | A$14.96 | A$85 | **A$70.04** | 82% |

Profit = retail − cost. Cost = landed cost/vial (incl. shipping) in AUD; full kits add the
editable **kit extras** (BAC water + syringe + swabs + packaging, default A$6 — set later).
Two master fields (FX rate + kit extras) drive every figure.
