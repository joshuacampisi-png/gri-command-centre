# NovaPeptides — Cost & Profit Dashboard

Landed-cost stocktake and P&L for NovaPeptides.com.au.

## Files
- **`profit-loss-dashboard.html`** — open in any browser. Branded dashboard with live
  margin calculator. Enter your AUD retail prices (and today's USD→AUD rate) to see
  profit per vial, margin %, stock value and potential profit. Print to PDF for records.
- **`novapeptides-stocktake.csv`** — same data for Excel / Google Sheets. Editable
  retail column with live formulas.

## Method
Each product carries a share of freight proportional to its value (standard landed-cost
allocation), so the cost per vial includes shipping.

- Order 1 (main shipment): subtotal $753.60 + $240 freight = **$993.60** → ×1.3185
- Order 2 (RT60): subtotal $257.60 + $80 freight = **$337.60** → ×1.3106
- Combined landed cost = **$1,331.20 USD** (reconciles to both supplier totals)

### Landed cost per vial (USD, freight included)
| Product | Landed/vial |
|---|---|
| Reta RT60 | $32.50 |
| KLOW 80mg | $27.00 |
| GLOW 70mg | $22.89 |
| Reta RT30 | $21.62 |
| BPC-157 + TB-500 10mg | $11.81 |
| SS-31 10mg | $10.34 |
| BAC water 3ml | $0.77 (incl. 20 free vials) |

All supplier costs are USD. Convert to AUD with the rate field for accurate margins.
