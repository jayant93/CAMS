# CAMS extraction service (Cloudflare Worker)

Server-side companion for the camsAI VS Code extension. It accepts context bundles from the extension and calls [OpenRouter](https://openrouter.ai/) using **your** API key on the server. The OpenRouter key is never shipped to clients.

This folder is a self-contained Worker: `index.ts` + `wrangler.toml`. There is no separate `package.json` here; use `npx wrangler` from this directory.

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- A Cloudflare account and [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm i -g wrangler` or use `npx wrangler` below)
- An [OpenRouter](https://openrouter.ai/) API key

## Local development

From the repository root:

```bash
cd backend
npx wrangler dev
```

Wrangler serves the worker locally (default **http://127.0.0.1:8787**). Use that URL as `camsAI.ai.serviceUrl` in VS Code while testing the extension.

Optional model override: `[vars]` in `wrangler.toml` sets `OPENROUTER_MODEL`. For production secrets, use Wrangler secrets (next section), not committed files.

## Production setup

1. **Authenticate Wrangler** (once per machine), then deploy from `backend/`:

   ```bash
   cd backend
   npx wrangler login
   npx wrangler deploy
   ```

2. **Set secrets** on the Worker (not in `wrangler.toml`):

   ```bash
   npx wrangler secret put OPENROUTER_API_KEY
   npx wrangler secret put LICENSE_SECRET
   ```

   `LICENSE_SECRET` is optional. If omitted or empty, Pro license verification is disabled and all clients are treated as the free tier unless you change that logic.

3. **Point the extension at your deployment** using either:

   - VS Code setting **`camsAI.ai.serviceUrl`** — e.g. `https://cams-service.<your-subdomain>.workers.dev`, or  
   - Rebuild the extension after setting `DEFAULT_SERVICE_URL` in `src/ai/serviceClient.ts` (see main repository README).

## Environment variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `OPENROUTER_API_KEY` | Yes (production) | — | Server-side OpenRouter key |
| `OPENROUTER_MODEL` | No | See `wrangler.toml` `[vars]` | Model for extractions |
| `LICENSE_SECRET` | No | — | HMAC secret for Pro license keys (empty disables Pro verification) |

## Generating Pro license keys

```ts
import * as crypto from 'crypto';

function generateLicenseKey(deviceId: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret).update(deviceId).digest('hex');
  return Buffer.from(`${deviceId}:${hmac}`).toString('base64url');
}
```

You can also use `node generate-key.js <deviceId> <LICENSE_SECRET>` in this folder. Issue one key per subscriber and deliver it securely; the extension stores the key in VS Code Secret Storage.

## Alternative platforms

The handler in `index.ts` is WinterCG-style (`fetch` export). You can adapt it for Vercel or other hosts by wrapping the same handler and mapping `env` from their environment configuration.

## Security note

Do **not** commit `backend/.wrangler/` (local cache and account metadata). It is listed in the root `.gitignore`.
