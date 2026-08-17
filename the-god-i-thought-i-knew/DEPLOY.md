# Deploying mosescampisi.com

Everything in `public/` is a plain static site. There is no framework and no
server-side code, so any static host will run it. The instructions below assume
Vercel.

## What is in the deploy

| Path | What it is |
| --- | --- |
| `/` | The launch site. Public, indexed, `Get the Book` at $12.95. |
| `/read/` | The full flip-book reader. **Unlisted** — nothing links to it and `robots.txt` disallows it, so it is family-only unless you decide otherwise. |
| `/media/` | Cover art, six interior photographs, author portrait, social card, icons. |
| `/fonts/` | Literata and Cormorant Garamond, self-hosted. |
| `/content/book.json` | The paginated manuscript the reader loads. |

## Rebuilding the assets

Only needed if the source photographs or the manuscript change.

```bash
npm install
npm run build     # regenerates public/media and public/content/book.json
npm run qa        # headless checks for both the site and the reader
```

`scripts/source-images/` holds the original JPEGs. `scripts/book-source.md` is
the manuscript. Neither is served.

## First deploy

You need a Vercel token — a password is never required and should not be shared.

1. Go to <https://vercel.com/account/tokens>, create a token, scope it to your
   personal account, and copy it.
2. From this directory:

```bash
npm i -g vercel
export VERCEL_TOKEN=<the token>
vercel --token "$VERCEL_TOKEN" --yes --prod
```

The `vercel.json` in this folder already sets `outputDirectory: public`, so
Vercel will not try to run a build.

## Pointing mosescampisi.com at it

```bash
vercel domains add mosescampisi.com --token "$VERCEL_TOKEN"
vercel domains add www.mosescampisi.com --token "$VERCEL_TOKEN"
```

Then in GoDaddy, under **My Products → Domains → mosescampisi.com → DNS**, set:

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| A | `@` | `76.76.21.21` | 600 |
| CNAME | `www` | `cname.vercel-dns.com` | 600 |

Notes:

- Delete only the existing `A @` and `CNAME www` records if they conflict.
  Leave every `MX` and `TXT` record alone or email for the domain will break.
- GoDaddy adds a parked `A @` record pointing at their own IP by default. That
  is the one to replace.
- Vercel issues the SSL certificate automatically once the records resolve,
  usually within a few minutes. DNS can take up to an hour to propagate.
- Set the apex (`mosescampisi.com`) as the primary domain in Vercel so `www`
  redirects to it, giving one canonical URL.

Verify both:

```bash
curl -sSI https://mosescampisi.com | head -1
curl -sSI https://www.mosescampisi.com | head -1
```

## Connecting Stripe later

Every purchase button on the page carries the class `js-buy` and routes through
one function, `startCheckout()`, in `public/site/site.js`. To go live:

1. Create a Stripe Product at $12.95 and a Payment Link or Checkout Session.
2. Replace the body of `startCheckout()` with a redirect to that URL.
3. Delete the `#checkout` modal markup from `index.html`.

Nothing else on the page needs to change, and the price appears in exactly two
places: the `.price` spans in `index.html` and the JSON-LD `offers` block.

## Outstanding

- `public/media/moses-hero.jpg` does not exist yet. The hero currently falls
  back to the cover artwork. Drop the high-resolution photograph of Moses in at
  that path and change the one `src` in `index.html` (it is commented).
  Check the framing on mobile afterwards — `object-position` in
  `site.css` under `.hero-media img` controls the crop.
