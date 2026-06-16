# Abundantia — one-page beard & skin oil site

A self-contained, dependency-free prestige landing page for the **Abundantia**
organic botanical elixir.

## Run it
Just open `index.html` in a browser. No build step, no install.

For a local server (recommended so the fonts/assets load cleanly):

```bash
cd abundantia-site
python3 -m http.server 8080
# visit http://localhost:8080
```

## What's inside
- `index.html` — the entire site (HTML + CSS + vanilla JS inline)
- `assets/product.png` — actual product bottle (hero + buy + sticky bar)
- `assets/moodboard.jpeg` — brand mood board (story section)

## Design notes
- Palette: deep forest greens + gold foil + cream, matching the label.
- Type: Pinyon Script wordmark + Cormorant Garamond serif + Jost for UI/labels.
- Price: **$69.99** (60ml / 2 fl oz), with quantity selector and live total.
- UX: sticky nav, scroll-reveal sections, sticky buy bar, mobile nav, add-to-cart
  toast, reduced-motion support, fully responsive.
- Copy/ingredients (camomile for sensitive skin, castor oil, wild rosemary,
  jojoba) and reviews are placeholder filler — swap before going live.
