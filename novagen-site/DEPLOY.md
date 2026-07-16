# Deploying Novagen Australia to novagenaustralia.com.au

The site in this folder is a self-contained static site (no build step). Below are
two ways to serve it at **novagenaustralia.com.au**. Pick one.

> The final DNS record change happens in **your** domain registrar / DNS host — it
> can't be done from inside this repo. Everything else is already prepared here:
> `novagen-site/CNAME` pins the custom domain, and
> `.github/workflows/deploy-novagen-site.yml` publishes the folder on push to `main`.

---

## Option A — GitHub Pages (recommended, free, already wired up)

**1. Enable Pages (one-time):**
Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.

**2. Publish:**
The workflow `deploy-novagen-site.yml` runs automatically when `novagen-site/**`
changes on `main` (merge this branch), or run it manually from the **Actions** tab
(`Deploy Novagen site to GitHub Pages` → *Run workflow*). It uploads `novagen-site/`
and deploys it; the `CNAME` file sets the custom domain automatically.

**3. Point DNS** at your registrar (for `.com.au` this is where you manage the zone):

Apex domain `novagenaustralia.com.au` → four A records + four AAAA records:

```
A     @   185.199.108.153
A     @   185.199.109.153
A     @   185.199.110.153
A     @   185.199.111.153
AAAA  @   2606:50c0:8000::153
AAAA  @   2606:50c0:8001::153
AAAA  @   2606:50c0:8002::153
AAAA  @   2606:50c0:8003::153
```

`www` subdomain → CNAME to your Pages host:

```
CNAME www   <your-github-username-or-org>.github.io.
```

**4. HTTPS:** In Settings → Pages, tick **Enforce HTTPS** once the certificate is
issued (can take a few minutes to an hour after DNS propagates).

> If your DNS provider doesn't allow A/AAAA on the apex, use an **ALIAS/ANAME**
> record on `@` pointing to `<username>.github.io` instead.

---

## Option B — Railway (matches this repo's existing infra)

This repo already auto-deploys the Command Centre app to Railway on push to `main`.
The Novagen site is **separate static content**, so serve it as its own Railway
service rather than mixing it into the app:

1. Create a new Railway **static site** service (or a tiny static file server)
   whose root/publish directory is `novagen-site/`.
2. In that service → **Settings → Networking → Custom Domain**, add
   `novagenaustralia.com.au`. Railway will show a target hostname.
3. At your registrar, add the DNS record Railway gives you:
   - `www` → **CNAME** to the Railway-provided target, and
   - apex `@` → **ALIAS/ANAME** to the same target (or Railway's A record if shown).
4. Railway provisions the TLS certificate automatically once DNS resolves.

Remove `novagen-site/CNAME` if you go the Railway route — that file is a
GitHub Pages directive and is ignored (harmless) elsewhere.

---

## After it's live — checklist

- [ ] DNS resolves: `dig novagenaustralia.com.au +short`
- [ ] HTTPS padlock valid (certificate issued)
- [ ] Home, blog articles, `terms.html`, `privacy.html` all load
- [ ] Booking form still front-end only — wire it to a real endpoint before taking
      real orders (see the `POST` placeholder comment in `script.js`)
- [ ] Replace placeholder lab postage address, ABN, and legal blanks (see `README.md`)
