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

### AI-enriched context (built in, no setup)

CAMS includes AI extraction out of the box — no API key required. When you switch assistants or save a snapshot, it calls the CAMS service to infer a structured `goal`, `decisions`, `assumptions`, and `pending` list from your recent diffs and notes. The baseline local prompt is copied instantly; the AI-enriched version overwrites the clipboard within a few seconds if you have not pasted yet.

Free tier gets 5 AI enrichments per day. Pro gets 50.

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
| Setup required | None | Enter license key via "CAMS: Configure Pro" |

---

## Getting Started

1. Install the extension and open any project in VS Code.
2. The status bar shows `CAMS: <session>` — capture is running immediately.
3. Write code normally. Switch to a different AI assistant chat panel.
4. Status bar flashes: **"CAMS handoff copied. Paste with Ctrl+V"**
5. Paste in the new assistant. Done.

### Upgrading to Pro

Run **CAMS: Configure Pro** from the Command Palette and paste your license key. The status bar updates to `Pro` and your next handoff will include the higher daily limit.

---

## Commands

| Command | What it does |
|---|---|
| `CAMS: Name Current Session` | Give the auto-started session a meaningful name |
| `CAMS: Rename Current Session` | Rename the active session at any time |
| `CAMS: Save Context Snapshot` | Paste or type a chat excerpt to preserve it |
| `CAMS: Continue Task In...` | Manually trigger a handoff and choose the target assistant |
| `CAMS: End Session` | Close the current session and start a fresh one |
| `CAMS: Configure Pro` | Enter or remove your Pro license key |

---

## Settings

| Setting | Default | What it controls |
|---|---|---|
| `cams.offlineMode` | `false` | Disable all network calls; AI enrichment is skipped |
| `cams.session.autoStart` | `true` | Auto-start a session when VS Code opens |
| `cams.session.autoHandoffOnAssistantSwitch` | `true` | Auto-copy a handoff prompt on assistant switch |
| `cams.ai.enrichHandoff` | `true` | Enrich handoffs with AI-inferred decisions and pending items |
| `cams.ai.autoExtractOnSnapshot` | `true` | Run AI extraction automatically after each snapshot |
| `cams.ai.serviceUrl` | `""` | Override the service URL (for self-hosted deployments) |
| `cams.capture.enabled` | `true` | Record workspace file edits while a session is active |
| `cams.capture.maxDiffChars` | `20000` | Per-diff character cap |
| `cams.prompt.maxChars` | `30000` | Maximum size of the generated handoff prompt |

---

## Privacy

All file capture is local. Your source code and diffs never leave your machine.

When AI enrichment fires, **only the snapshot text you explicitly save** is transmitted to the CAMS service — never raw code files or diffs. The service uses this text to extract structured context and returns the result. No data is stored server-side beyond the request lifetime.

Set `cams.offlineMode: true` to disable all network activity.

---

## Known Limitations

- Assistant switch detection is heuristic (VS Code tab inspection). It covers all major AI panels and falls back gracefully on unknown ones.
- Auto-handoffs are throttled to once every 30 seconds to avoid clipboard spam.
- Timeline panel and multi-task management are planned for a future release.

---

## License

MIT
