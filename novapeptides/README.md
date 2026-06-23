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

### Cost per vial in AUD — shipping included (at 1.45 USD→AUD)
| Product | Cost / vial |
|---|---|
| Reta RT60 | A$47.34 |
| KLOW 80mg | A$39.09 |
| GLOW 70mg | A$33.13 |
| Reta RT30 | A$31.31 |
| BPC-157 + TB-500 10mg | A$17.11 |
| SS-31 10mg | A$14.96 |
| BAC water 3ml | A$1.12 (incl. 20 free vials) |
| **Total landed** | **A$1,930.24** |

Everything displays in AUD. One master rate field (HTML up top / CSV cell B5) sets the
USD→AUD conversion — change it to the rate you actually paid and every price updates.
Mid-market was ~1.43 in June 2026; 1.45 is the default to cover typical card/transfer fees.
