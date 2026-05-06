var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// index.ts
var rateLimitStore = /* @__PURE__ */ new Map();
function todayWindowStart() {
  const now = /* @__PURE__ */ new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}
__name(todayWindowStart, "todayWindowStart");
function checkAndIncrementLimit(deviceId, limit) {
  const window = todayWindowStart();
  const entry = rateLimitStore.get(deviceId);
  if (!entry || entry.windowStart < window) {
    rateLimitStore.set(deviceId, { count: 1, windowStart: window });
    return { allowed: true, remaining: limit - 1, resetAt: nextMidnightUTC() };
  }
  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: nextMidnightUTC() };
  }
  entry.count += 1;
  return { allowed: true, remaining: limit - entry.count, resetAt: nextMidnightUTC() };
}
__name(checkAndIncrementLimit, "checkAndIncrementLimit");
function nextMidnightUTC() {
  const d = /* @__PURE__ */ new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}
__name(nextMidnightUTC, "nextMidnightUTC");
async function isValidLicenseKey(licenseKey, secret) {
  try {
    const decoded = atob(licenseKey.replace(/-/g, "+").replace(/_/g, "/"));
    const colonIdx = decoded.lastIndexOf(":");
    if (colonIdx === -1) return false;
    const deviceId = decoded.slice(0, colonIdx);
    const providedHmac = decoded.slice(colonIdx + 1);
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", keyMaterial, new TextEncoder().encode(deviceId));
    const expectedHmac = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
    return providedHmac === expectedHmac;
  } catch {
    return false;
  }
}
__name(isValidLicenseKey, "isValidLicenseKey");
var DEFAULT_MODEL = "openai/gpt-4o-mini";
var OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
async function callOpenRouter(apiKey, model, systemPrompt, userText) {
  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://github.com/continuity-vscode/continuity",
      "X-Title": "Continuity VS Code Extension"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText.slice(0, 2e4) }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1
    })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenRouter returned ${response.status}: ${detail.slice(0, 200)}`);
  }
  const json2 = await response.json();
  if (json2.error?.message) throw new Error(`OpenRouter error: ${json2.error.message}`);
  const content = json2.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("OpenRouter response missing content.");
  return content;
}
__name(callOpenRouter, "callOpenRouter");
var index_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/api/extract") {
      return json({ error: "Not found." }, 404);
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body." }, 400);
    }
    const { task, systemPrompt, userText, deviceId, licenseKey } = body;
    if (!deviceId || !systemPrompt || !userText || !task) {
      return json({ error: "Missing required fields: task, systemPrompt, userText, deviceId." }, 400);
    }
    const licenseSecret = env.LICENSE_SECRET ?? "";
    const isPro = !!licenseKey && licenseSecret.length > 0 && await isValidLicenseKey(licenseKey, licenseSecret);
    const freeLimit = parseInt(env.FREE_DAILY_LIMIT ?? "5", 10);
    const proLimit = parseInt(env.PRO_DAILY_LIMIT ?? "50", 10);
    const limit = isPro ? proLimit : freeLimit;
    const { allowed, remaining, resetAt } = checkAndIncrementLimit(deviceId, limit);
    if (!allowed) {
      const hint = isPro ? "" : " Upgrade to Pro for 50 requests/day.";
      return json(
        {
          error: `Daily AI request limit reached (${limit}/day).${hint}`,
          message: `Daily AI request limit reached (${limit}/day).${hint}`,
          resetAt
        },
        429
      );
    }
    const apiKey = env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return json({ error: "Service misconfigured: missing OpenRouter key." }, 500);
    }
    const model = env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
    try {
      const content = await callOpenRouter(apiKey, model, systemPrompt, userText);
      return json(
        { content },
        200,
        {
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": String(remaining),
          "X-RateLimit-Reset": resetAt,
          "X-Tier": isPro ? "pro" : "free"
        }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json({ error: `Upstream error: ${message}` }, 502);
    }
  }
};
function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      ...extraHeaders
    }
  });
}
__name(json, "json");

// ../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-wuK4GK/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = index_default;

// ../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-wuK4GK/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
