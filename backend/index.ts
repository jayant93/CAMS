/**
 * Continuity Extraction Service
 * ==============================
 * Deploy this to any edge/serverless platform (Cloudflare Workers, Vercel,
 * Deno Deploy, Node + Express, etc.). It receives context bundles from the
 * VS Code extension and calls OpenRouter
 * internally. Users never see your OpenRouter key.
 *
 * Environment variables required:
 *   OPENROUTER_API_KEY   — your OpenRouter key (server-side only, never exposed)
 *   OPENROUTER_MODEL     — e.g. "deepseek/deepseek-chat:free" (default used if unset)
 *   LICENSE_SECRET       — shared secret used to validate license keys (see below)
 *
 * License key validation (simple HMAC scheme):
 *   A Pro license key is:  base64( deviceId + ":" + hmac(deviceId, LICENSE_SECRET) )
 *   The service verifies the HMAC. In production replace this with a real
 *   subscription database (e.g. Stripe webhook → KV store).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExtractRequest {
  task: 'conversation' | 'activity' | 'session-name';
  systemPrompt: string;
  userText: string;
  deviceId: string;
  licenseKey?: string | null;
}

// ---------------------------------------------------------------------------
// License key validation
// ---------------------------------------------------------------------------

async function isValidLicenseKey(
  licenseKey: string,
  secret: string
): Promise<boolean> {
  try {
    // Key format: base64url( deviceId + ":" + hex(hmac-sha256(deviceId, secret)) )
    // In production: look up the key in a Stripe/Paddle subscription DB instead.
    const decoded = atob(licenseKey.replace(/-/g, '+').replace(/_/g, '/'));
    const colonIdx = decoded.lastIndexOf(':');
    if (colonIdx === -1) return false;
    const deviceId = decoded.slice(0, colonIdx);
    const providedHmac = decoded.slice(colonIdx + 1);

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', keyMaterial, new TextEncoder().encode(deviceId));
    const expectedHmac = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return providedHmac === expectedHmac;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// OpenRouter call
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'deepseek/deepseek-chat:free';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

class OpenRouterHttpError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(`OpenRouter returned ${status}: ${detail.slice(0, 500)}`);
    this.name = 'OpenRouterHttpError';
    this.status = status;
    this.detail = detail;
  }
}

async function callOpenRouter(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userText: string
): Promise<string> {
  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com/continuity-vscode/continuity',
      'X-Title': 'Continuity VS Code Extension'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText.slice(0, 20000) }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new OpenRouterHttpError(response.status, detail || 'Unknown upstream error');
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (json.error?.message) throw new Error(`OpenRouter error: ${json.error.message}`);
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('OpenRouter response missing content.');
  return content;
}

// ---------------------------------------------------------------------------
// Request handler  (Cloudflare Worker / WinterCG compatible)
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Record<string, string>): Promise<Response> {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/api/extract') {
      return json({ error: 'Not found.' }, 404);
    }

    // -- Parse body -----------------------------------------------------------
    let body: ExtractRequest;
    try {
      body = (await request.json()) as ExtractRequest;
    } catch {
      return json({ error: 'Invalid JSON body.' }, 400);
    }

    const { task, systemPrompt, userText, deviceId, licenseKey } = body;
    if (!deviceId || !systemPrompt || !userText || !task) {
      return json({ error: 'Missing required fields: task, systemPrompt, userText, deviceId.' }, 400);
    }

    // -- Determine tier --------------------------------------------------------
    const licenseSecret = env.LICENSE_SECRET ?? '';
    const isPro =
      !!licenseKey &&
      licenseSecret.length > 0 &&
      (await isValidLicenseKey(licenseKey, licenseSecret));

    // -- Call OpenRouter ------------------------------------------------------
    const apiKey = env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return json({ error: 'Service misconfigured: missing OpenRouter key.' }, 500);
    }

    const model = env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

    try {
      const content = await callOpenRouter(apiKey, model, systemPrompt, userText);
      return json(
        { content },
        200,
        {
          'X-Tier': isPro ? 'pro' : 'free'
        }
      );
    } catch (err) {
      if (err instanceof OpenRouterHttpError) {
        let parsedDetail: unknown = err.detail;
        try {
          parsedDetail = JSON.parse(err.detail);
        } catch {
          // Keep raw text detail when upstream body is not JSON.
        }

        return json(
          {
            error: 'OpenRouter upstream error',
            upstreamStatus: err.status,
            upstream: parsedDetail
          },
          err.status
        );
      }

      const message = err instanceof Error ? err.message : String(err);
      return json({ error: `Upstream error: ${message}` }, 502);
    }
  }
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function json(
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...extraHeaders
    }
  });
}
