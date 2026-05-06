# Continuity Extraction Service

This is the server-side component for Continuity. It receives context bundles from
the VS Code extension, enforces per-device rate limits, and calls OpenRouter
internally. Your OpenRouter key never leaves this server.

## Deploying

### Cloudflare Workers (recommended)

```bash
npm create cloudflare@latest -- continuity-service --template=worker-typescript
# Copy backend/index.ts into src/index.ts
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put LICENSE_SECRET
npx wrangler deploy
```

### Vercel (Node.js serverless)

Wrap the fetch handler in `api/extract.ts` using `@vercel/node`:

```ts
import handler from '../backend/index';
export default async (req, res) => {
  const r = await handler.fetch(new Request(...), process.env);
  res.status(r.status).json(await r.json());
};
```

### Local dev

```bash
npx wrangler dev
# or
npx miniflare backend/index.ts
```

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `OPENROUTER_API_KEY` | Yes | — | Your OpenRouter key (never sent to clients) |
| `OPENROUTER_MODEL` | No | `openai/gpt-4o-mini` | Model to use for all extractions |
| `FREE_DAILY_LIMIT` | No | `5` | AI requests/day for anonymous (free) devices |
| `PRO_DAILY_LIMIT` | No | `50` | AI requests/day for verified Pro license keys |
| `LICENSE_SECRET` | No | — | HMAC secret for verifying license keys (leave empty to disable Pro tier) |

## Rate limiting

The in-memory store resets at UTC midnight. For a production deployment with
multiple instances, replace `rateLimitStore` with a Cloudflare KV namespace,
Redis, or a Postgres table.

## Generating Pro license keys

```ts
import * as crypto from 'crypto';

function generateLicenseKey(deviceId: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret).update(deviceId).digest('hex');
  return Buffer.from(`${deviceId}:${hmac}`).toString('base64url');
}
```

Generate one key per customer, store it against their subscription in your
billing system, and email it to them after payment. When they enter it in
VS Code the extension includes it in every API call; the service verifies the
HMAC without needing a database lookup (or optionally add a KV lookup to support
key revocation).

## After deployment

Update `DEFAULT_SERVICE_URL` in `src/ai/serviceClient.ts` to your deployed URL:

```ts
export const DEFAULT_SERVICE_URL = 'https://your-worker.your-account.workers.dev';
```

Then recompile and repackage the extension:

```bash
npm run compile
npm run package
```
