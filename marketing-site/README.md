# camsAI Marketing Single-Page App

Static marketing page for `camsAI` that can be deployed on Cloudflare's free tier.

## Files

- `index.html` — full single-file landing (Tailwind CDN + animations). Migrated from the repository root and retargeted for **camsAI** (`camsAI.camsAI` on the Marketplace).
- `wrangler.toml` — Cloudflare static assets config.

## Repository root

Opening `../index.html` at the repo root **redirects** to `marketing-site/index.html` so local browsing still lands on the site.

## Deploy to Cloudflare (Free)

1. Install Wrangler (if needed):
   - `npm i -g wrangler`
2. Login:
   - `wrangler login`
3. Deploy:
   - `wrangler deploy`

Wrangler will return a `.workers.dev` URL you can use immediately.

## Marketplace link

The page includes direct install links to:

- `https://marketplace.visualstudio.com/items?itemName=camsAI.camsAI`

## Analytics setup

This page includes a **Cloudflare Web Analytics** beacon at the bottom of `index.html`.

To enable analytics:

1. Create/get your token in Cloudflare Web Analytics.
2. Open `index.html`.
3. Replace:
   - `YOUR_CLOUDFLARE_BEACON_TOKEN`
4. Redeploy using `wrangler deploy`.

## Optional custom domain

In Cloudflare dashboard, open the deployed worker and attach a route/domain.
