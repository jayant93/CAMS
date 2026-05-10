# CAMS - AI Context Handoff for VS Code

> **Never lose context when switching AI assistants.**

You are mid-session with Claude. You open GitHub Copilot to try something. The new assistant has no idea what you were doing, which files you touched, or what decisions you just made. You spend the next few minutes re-explaining everything.

**CAMS fixes this.** It silently watches your work, records what changed, and the moment you open a different AI chat panel it auto-copies a rich, structured handoff prompt to your clipboard. Paste with `Ctrl+V` and the new assistant picks up exactly where you left off.

---

## What It Does

### Zero-friction context capture

From the moment VS Code starts, CAMS tracks which files you edit and records the diffs locally. Nothing is sent anywhere until you switch assistants. You never have to remember to "save context" — it just runs.

### Automatic handoff on assistant switch

When you focus a different AI chat panel, CAMS detects the switch in real time and writes a structured prompt to your clipboard. The prompt includes your current task goal, the files you touched, recent code changes, and any snapshots you saved. A status bar flash confirms it is ready to paste.

### AI-enriched context

When a hosted extraction service is configured, switching assistants or saving a snapshot can call that service to infer a structured `goal`, `decisions`, `assumptions`, and `pending` list. The baseline local prompt is copied first; an AI-enriched version can replace the clipboard shortly after if you have not pasted yet.

**Open-source builds** ship with no default service URL. Deploy the Worker in `backend/` (see [Backend setup](#backend-extraction-service)), then set **`camsAI.ai.serviceUrl`** in VS Code to your deployment URL (or set `DEFAULT_SERVICE_URL` in `src/ai/serviceClient.ts` before packaging). End users of a published extension do not need their own OpenRouter key; the server holds it.

Typical limits when using the reference Worker: free tier 5 AI enrichments per day, Pro (license key) 50 per day — enforced by your deployed service.

### Manual snapshots for important moments

After a key AI exchange, run **CAMS: Save Context Snapshot** and paste the conversation text. CAMS stores it alongside your diffs and uses it to make the next handoff smarter.

---

## Supported AI Assistants

CAMS detects switches between any of the following and falls back gracefully on unlisted panels:

GitHub Copilot · Claude · Gemini · ChatGPT · Codex · Continue · Cline · Roo Cline · Cody · Cursor · Windsurf · Tabnine

---

## Free vs Pro

| | **Free** (default) | **Pro** (license key) |
|---|---|---|
| Handoff payload | Task goal, touched files, recent diffs, manual snapshots | Everything in Free + AI-inferred goal, decisions, assumptions, pending |
| AI enrichments/day | 5 | 50 |
| Handoff speed | Instant local baseline | Instant baseline + AI version in ~2-5 s |
| Setup required | Set `camsAI.ai.serviceUrl` (or ship a build with a default URL) | Enter license key via **camsAI: Configure Pro** |

---

## Getting Started

1. Install the extension and open any project in VS Code.
2. The status bar shows `CAMS: <session>` — capture is running immediately.
3. Write code normally. Switch to a different AI assistant chat panel.
4. Status bar flashes: **"CAMS handoff copied. Paste with Ctrl+V"**
5. Paste in the new assistant. Done.

### Upgrading to Pro

Run **camsAI: Configure Pro** from the Command Palette and paste your license key. The status bar updates to `Pro` and your next handoff will include the higher daily limit when your backend enforces it.

---

## Commands

| Command | What it does |
|---|---|
| `camsAI: Name Current Session` | Give the auto-started session a meaningful name |
| `camsAI: Rename Current Session` | Rename the active session at any time |
| `camsAI: Save Context Snapshot` | Paste or type a chat excerpt to preserve it |
| `camsAI: Continue Task In...` | Manually trigger a handoff and choose the target assistant |
| `camsAI: End Session` | Close the current session and start a fresh one |
| `camsAI: Configure Pro` | Enter or remove your Pro license key |

---

## Settings

| Setting | Default | What it controls |
|---|---|---|
| `camsAI.offlineMode` | `false` | Disable all network calls; AI enrichment is skipped |
| `camsAI.session.autoStart` | `true` | Auto-start a session when VS Code opens |
| `camsAI.session.autoHandoffOnAssistantSwitch` | `true` | Auto-copy a handoff prompt on assistant switch |
| `camsAI.ai.enrichHandoff` | `true` | Enrich handoffs with AI-inferred decisions and pending items |
| `camsAI.ai.autoExtractOnSnapshot` | `true` | Run AI extraction automatically after each snapshot |
| `camsAI.ai.serviceUrl` | `""` | Extraction Worker URL (required unless your VSIX was built with `DEFAULT_SERVICE_URL`) |
| `camsAI.capture.enabled` | `true` | Record workspace file edits while a session is active |
| `camsAI.capture.maxDiffChars` | `20000` | Per-diff character cap |
| `camsAI.prompt.maxChars` | `30000` | Maximum size of the generated handoff prompt |

---

## Privacy

All file capture is local. Your source code and diffs never leave your machine.

When AI enrichment fires, **only the snapshot text you explicitly save** is transmitted to the CAMS service — never raw code files or diffs. The service uses this text to extract structured context and returns the result. No data is stored server-side beyond the request lifetime.

Set `camsAI.offlineMode: true` to disable all network activity.

---

## Development

### Clone and install

```bash
git clone <your-repo-url>
cd CAMS
npm install
```

### Compile and test

```bash
npm run compile
npm test
```

### Package a VSIX and install in VS Code

The extension uses [@vscode/vsce](https://github.com/microsoft/vscode-vsce) (already a dev dependency).

```bash
npm run compile
npm run package
```

This produces a file like `camsAI-1.0.4.vsix` in the project root.

**Install from VSIX in VS Code**

1. Open VS Code.
2. Open the Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`).
3. Open the **⋯** menu on the Extensions panel header.
4. Choose **Install from VSIX…** and select the generated `.vsix` file.
5. Reload the window if prompted.

For day-to-day extension development, press `F5` in VS Code with this folder opened (**Run Extension**) instead of installing a VSIX each time.

### Backend (extraction service)

The Cloudflare Worker in `backend/` performs AI extraction using your OpenRouter key. See **[backend/README.md](backend/README.md)** for `wrangler dev`, secrets, and deploy steps.

After deploy, either set **`camsAI.ai.serviceUrl`** to your Worker URL (for local dev or internal builds) or set **`DEFAULT_SERVICE_URL`** in `src/ai/serviceClient.ts` before `npm run package` so end users do not need to configure the URL.

### Repository hygiene (open source)

- Never commit API keys, license secrets, or `.env` files.
- Never commit **`backend/.wrangler/`** — it contains Wrangler cache and account metadata. It is gitignored; if you forked an old revision that still tracked it, remove it from history or rotate credentials.

---

## Known Limitations

- Assistant switch detection is heuristic (VS Code tab inspection). It covers all major AI panels and falls back gracefully on unknown ones.
- Auto-handoffs are throttled to once every 30 seconds to avoid clipboard spam.
- Timeline panel and multi-task management are planned for a future release.

---

## License

MIT
