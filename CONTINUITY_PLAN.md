# Continuity - Deep Implementation Plan

**A VS Code extension that prevents context loss when switching AI assistants (Claude, Gemini, Copilot, Codex etc.) during token exhaustion.**  
Version: Production-grade MVP to full product.  
Date: 2026-05-05

---

## 1. Product Vision & Core Problem

### Problem

In VS Code, an engineer works on Task A, for example "fix auth refresh bug", with Claude.
Tokens run out. They switch to Gemini or Copilot.
Currently they must manually re-explain the entire context, losing key decisions, dead-ends, assumptions, and nuance.
This breaks flow, causes duplicated work, and leads to inconsistent results.

### Vision

A single VS Code extension that:

- Quietly captures task context: files touched, user-declared goal, and optionally AI-extracted decisions.
- Automatically formats a rich handoff prompt ready to be pasted into the next AI assistant.
- Works across Claude, Copilot, Gemini, Codex, and future AI coding extensions.

North star: "Continue where you left off, regardless of which AI assistant you pick next."

---

## 2. Core Technical Architecture

### Language & Runtime

- TypeScript, Node.js 20 or newer: full VS Code Extension API typing and compile-time safety.
- Package manager: npm or pnpm.

### Monorepo-Ready Structure

```text
continuity/
├── package.json
├── tsconfig.json
├── src/
│   ├── extension.ts                 # activate / deactivate, command registration
│   ├── commands/
│   │   ├── startTask.ts             # "Continuity: Start Task"
│   │   ├── snapshotTask.ts          # "Continuity: Save Context Snapshot"
│   │   └── continueTask.ts          # "Continuity: Continue Task in..."
│   ├── capture/
│   │   ├── fileWatcher.ts           # workspace file events -> diffs
│   │   ├── chatSnapshot.ts          # user-selected text / clipboard capture
│   │   ├── decisionExtractor.ts     # calls DeepSeek Flash / local model
│   │   └── contextBuilder.ts        # assembles full task state
│   ├── storage/
│   │   ├── db.ts                    # sql.js init & migrations
│   │   ├── taskRepository.ts        # CRUD for tasks, events, decisions
│   │   └── migrations/
│   ├── injection/
│   │   ├── promptEngine.ts          # builds language-agnostic handoff prompt
│   │   └── delivery.ts              # clipboard, command URIs, chat API attempts
│   ├── ui/
│   │   ├── statusBar.ts             # shows active task, actions
│   │   └── webview/                 # optional richer history panel
│   ├── config/
│   │   ├── settings.ts              # VS Code settings contributions
│   │   └── secrets.ts               # API keys via SecretStorage
│   └── types.ts                     # Task, Event, Decision, Snapshot...
├── test/
│   ├── unit/
│   └── e2e/
├── .vscodeignore
└── README.md
```

### Key Dependencies

- `vscode`: extension API.
- `sql.js`: SQLite compiled to WASM, zero native install.
- Later: `better-sqlite3` as a native-layer add-on for performance.
- `axios` or `node-fetch`: HTTP calls to DeepSeek/Ollama.
- `diff`: compute text diffs for file edits.
- Optional `ollama`: local model integration.

### State Management

Simple internal event bus. The active task in SQLite is the single source of truth. No complex state library needed.

---

## 3. Data Model & Storage

Database: one SQLite file per workspace stored in `globalStorage` or `workspaceState` via `sql.js`.

Schema:

```sql
CREATE TABLE task (
  id TEXT PRIMARY KEY,          -- UUID
  name TEXT NOT NULL,           -- e.g. "Fix auth refresh bug"
  status TEXT DEFAULT 'active', -- active, paused, completed
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT REFERENCES task(id),
  type TEXT CHECK(type IN (
    'goal', 'decision', 'assumption', 'pending', 'snapshot', 'file_change'
  )),
  content TEXT,                 -- JSON or plain text
  metadata TEXT,                -- extra info, e.g. file path
  timestamp TEXT
);

CREATE TABLE file_edit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT REFERENCES task(id),
  file_path TEXT,
  diff TEXT,                    -- unified diff snippet
  timestamp TEXT
);
```

This gives a complete timeline of everything that happened during a task.

---

## 4. Capture Mechanisms

### 4.1 Explicit Task Start

Command `continuity.startTask`:

1. QuickPick asks for task name.
2. Insert into `task` table.
3. StatusBar displays "Task: fix auth refresh".
4. Immediately stores a goal event with the user's description.

### 4.2 Automatic File Change Capture

Listener: `workspace.onDidChangeTextDocument`, active only when a task is running.

- Compute lightweight unified diff using the `diff` library.
- Buffer events and flush to the `file_edit` table every 3 seconds or on big changes.
- Only track files inside the workspace.

### 4.3 Manual Context Snapshot, The Bridge

User selects conversation text in the AI extension's chat panel, then runs `continuity.snapshotTask`.

The extension tries:

```ts
vscode.window.activeTextEditor?.document.getText(selection)
```

This works if chat is in an editor, for example a `.chat` file. If that fails, it prompts a small webview input box where the user can paste the chat text.

Raw text is stored as a snapshot event linked to the active task.

### 4.4 AI Decision Extraction, DeepSeek Flash

#### Flow

After a manual snapshot, or on a dedicated "Extract Decisions" command, the extension sends the raw text to DeepSeek Chat API using model `deepseek-chat`, or a Flash variant.

Prompt, structured JSON mode:

```text
You are an expert at distilling developer-AI conversations.
Given this chat transcript, extract and return only valid JSON:
{
  "decisions": ["..."],
  "assumptions": ["..."],
  "pending": ["..."],
  "goal": "..."
}
If none found, use empty arrays. Keep each item under 100 characters.
```

Parse response, then create decision, assumption, and pending events attached to the task.

These enrich the task context instantly.

#### Privacy Options

Cloud AI, BYOK:

- User brings their own DeepSeek API key.
- Key is stored securely in VS Code SecretStorage.
- Data leaves the machine only with explicit consent.

Local-first, Pro perk:

- Integration with Ollama running a model such as Llama 3.1 8B.
- The extension sends a local request.
- No data leaves the device.
- Slightly slower but fully private.

#### Consent

First-time usage shows a one-time dialog:

```text
Continuity can send the selected chat text to DeepSeek (or a local model)
to extract decisions. No code files are ever sent. You can change this at
any time in settings.
```

#### API Key Management

Stored only in `vscode.secrets`. Never in `settings.json`, never in logs.

Command `continuity.configureAIService` lets users switch between cloud DeepSeek/GPT and local Ollama.

---

## 5. Injection, The Handoff

### Goal

Get the reconstructed context into the new AI assistant's conversation with zero manual typing.

### 5.1 Prompt Builder, `promptEngine.ts`

Assembles a structured handoff prompt from:

- Task name and goal.
- Last 3 file diffs per touched file, from `file_edit`.
- Extracted decisions, assumptions, and pending items, from AI extraction or manual snapshot.
- Timestamp of last activity.

Example output:

```text
[Continuity Handoff]
Task: Fix auth refresh bug
Goal: Ensure token refresh works across app restart without logging out.

Files modified:
- src/auth.ts: added refresh logic (last 3 edits attached)
- src/tokenStore.ts: switched from localStorage to IndexedDB

Decisions made:
- Use JWT refresh rotation
- Store token in IndexedDB for persistence

Assumptions:
- Backend returns 401 with a valid refresh_token field

Pending:
- Implement error handling when refresh endpoint fails
- Write unit tests for token refresh flow

Continue from here.
```

### 5.2 Delivery Options

#### Clipboard + Notification, MVP, Robust

- Prompt built and copied to clipboard.
- VS Code information message: "Continuity: context copied. Open your target assistant and press Ctrl+V to paste."
- Works with every AI extension.

#### Command URI to Open Chat, Semi-Automatic

Many extensions register commands like `github.copilot.chat.open`. Continuity can execute that command to bring up the chat panel, then show a toast: "Paste with Ctrl+V".

No direct injection because input fields are sandboxed.

#### Custom Chat Participant, Future Pro

Build a `vscode.chat` participant that acts as a proxy, pre-filling context.

This still cannot force other extensions to receive the prompt, but can present a seamless interface for the user.

Production strategy:

- Ship clipboard first.
- Add command-opening as an optional convenience.
- Keep monitoring the VS Code API for better integration.

---

## 6. Phased Development Plan

### Phase 0: Foundation, Week 1-2

- Scaffold extension with `yo code`, TypeScript, linter, and test framework.
- Implement `sql.js` database init and task repository.
- Command "Start Task" writes goal and activates file watcher.
- Simple file watcher records file edits, unfiltered.
- Status bar shows active task name.
- Basic clipboard-based handoff with only file list and goal.

Exit criteria: Can start a task, edit a file, and see a handoff prompt in clipboard.

### Phase 1: Core Handoff, Week 3-4

- Prompt engine with file diffs, timestamps, and context.
- "Continue Task in..." QuickPick lets the user pick target assistant: Gemini, Copilot, Claude, etc.
- Tailored prompt per target assistant.
- Manual snapshot command: user selects chat text, stores it as raw context, and includes it in prompt.
- First private alpha release on VS Code Marketplace for friendly users.

### Phase 2: AI Decision Extraction, Week 5-6

- Integrate DeepSeek Chat API with BYOK.
- Snapshot command optionally triggers AI extraction with consent dialog.
- Extracted decisions and pending items are stored and inserted into handoff prompt.
- Settings: API key, model selection, enable/disable.
- Add local Ollama integration behind feature flag for Pro users.

Exit: Decision extraction works for the end-to-end flow.

### Phase 3: Polish & Pro Features, Week 7-8

- Multiple simultaneous tasks and task switching.
- Heuristic auto-detection: if user edits files without an active task, offer to start one.
- Rich webview panel showing task timeline, decisions, and file tree.
- User-configurable prompt templates.
- Error handling, opt-in minimal telemetry, proper logging.
- Marketplace metadata update.

### Phase 4: Monetization & Production, Week 9-10

- Implement licensing check: hash plus VS Code Marketplace entitlement or external Gumroad key.
- Freemium tiers: free core vs. Pro.
- Pro features: AI extraction with built-in cloud key, multiple tasks, rich panel, local model.
- Enterprise: team context sync, future backend service.
- Public launch: landing page, documentation, demo video.

### Phase 5: Future, Post-Launch

- Deep VS Code Chat API integration when Microsoft opens more capabilities.
- Backend sync service for teams.
- JetBrains plugin.
- Advanced automatic context capture using permissioned LLM-based task boundary detection.

---

## 7. Monetization Model

Freemium with three tiers:

| Feature | Free | Pro ($6/mo) | Team ($15/user/mo) |
| --- | --- | --- | --- |
| Unlimited local tasks | Yes | Yes | Yes |
| File-diff context | Yes | Yes | Yes |
| Clipboard handoff | Yes | Yes | Yes |
| Manual snapshot | Yes | Yes | Yes |
| AI decision extraction, bring own key | Yes | Yes | Yes |
| AI extraction with built-in cloud key | No | Yes | Yes |
| Multiple simultaneous tasks | No | Yes | Yes |
| Rich context sidebar | No | Yes | Yes |
| Custom prompt templates | No | Yes | Yes |
| Private, local model Ollama integration | No | Yes | Yes |
| Team context sync & sharing | No | No | Yes |
| Admin analytics & on-prem | No | No | Yes |

Billing:

- Monthly or yearly with discount.
- Transactions through VS Code Marketplace for simplicity, or Pro license keys via Gumroad/Paddle for higher margins.
- Enterprise through direct sales.

---

## 8. Go-To-Market Strategy

- VS Code Marketplace listing with SEO-optimized title, description, and GIF demo.
- Keywords: "AI continuity", "GPT token limit", "Copilot handoff", "Claude to Gemini".
- Content marketing through dev.to, Hashnode, Medium.
- Video demo: 90-second screen recording showing the pain and fix.
- Community launch on Reddit, Hacker News Show HN, and AI coding Discord servers.
- Beta program: invite 5-10 developers who use multiple AI tools daily and collect testimonials.

---

## 9. Security & Privacy

- Local-first: all data stored on the user's machine; no backend required.
- Network calls only for AI extraction, and only selected chat text is sent.
- Code files are never sent unless the user explicitly selected them.
- Consent dialog before any external API call.
- API keys stored in VS Code SecretStorage using OS-level encryption.
- Offline mode disables all network calls via setting.
- Clear privacy policy included in the extension README.

---

## 10. Testing & CI/CD

- Unit tests: Jest with `@vscode/test-electron` stubs.
- Test prompt building, storage queries, and diff calculations.
- Integration tests: VS Code Extension Test Runner opens a real VS Code instance, simulates file changes, and executes commands.
- Manual E2E: test extension alongside Copilot, Claude, and Gemini extensions.
- CI: GitHub Actions runs lint, test, and packages with `vsce` on every push; auto-publishes on tag.
- Telemetry: opt-in only, simple event counting with no personal data, respecting `vscode.env.isTelemetryEnabled`.

---

## 11. Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| AI chat not accessible, no auto-capture | Lean into quick manual snapshot; make it one-click and valuable. |
| DeepSeek returns malformed JSON | Use `response_format: { type: 'json_object' }`, retry with stricter prompt. |
| Privacy worries | Offer local Ollama extraction or BYOK; no data leaves without explicit consent. |
| Marketplace competitors appear | Move fast, build open-source free tier, capture loyal user base. |
| VS Code API changes break functionality | Monitor VS Code Insiders, pin dependency versions, maintain E2E tests. |

---

## 12. Deep Insight: The Core Innovation

The true power of Continuity is not just the file-diff handoff. It is the decision extraction from a partial chat snapshot.

Without it, the tool is a clipboard manager. With it, the tool reconstructs the engineer's mental model: what they decided, what they assumed, and what remains.

That makes Continuity a memory for AI-augmented coding, not just a copy-paste helper.

Making that extraction cheap with DeepSeek Flash, privacy-respecting with BYOK plus local options, and seamless is the competitive moat.

---

## 13. Immediate Next Steps This Week

- Scaffold repository with `yo code`, push to GitHub.
- Implement Start Task command and SQLite schema.
- File watcher that logs file edits to the database.
- Minimal handoff: build string "Task: X, files: [list]", copy to clipboard.
- Share private alpha with 5 developers who use multiple AI assistants.
- Observe their behavior. The feedback will guide the next two months.

Good context should not die with token limits.

---

# Implementation Development Plan

This section turns the product brief into an executable engineering plan for building a production-grade MVP first, then expanding into the full product.

## Guiding Scope

The first production-grade MVP should prove one workflow:

1. A developer starts a task.
2. Continuity records touched files and lightweight diffs while they work.
3. The developer manually adds a chat snapshot when useful.
4. Continuity generates a high-quality handoff prompt.
5. The prompt is copied to clipboard and can be pasted into any AI assistant.

Everything else, including automatic assistant injection, rich panels, licensing, built-in AI keys, and team sync, should wait until this workflow is reliable.

## Recommended MVP Architecture

Use a small modular extension, but keep boundaries practical:

- `extension.ts`: dependency wiring, activation, command registration, dispose handling.
- `storage/db.ts`: SQLite lifecycle, migration execution, database persistence.
- `storage/taskRepository.ts`: all task/event/file-edit reads and writes.
- `capture/fileWatcher.ts`: observes text document changes and writes buffered diffs.
- `capture/chatSnapshot.ts`: reads selected text or prompts paste input.
- `injection/promptEngine.ts`: pure prompt-building logic, easy to unit test.
- `injection/delivery.ts`: clipboard and assistant-opening behavior.
- `ui/statusBar.ts`: active task indicator and command affordances.
- `types.ts`: shared task, event, file edit, and prompt types.

Avoid the webview, AI extractor, and monetization code in the first build. Add extension points for them, but do not ship half-finished surfaces.

## Work Breakdown

### Milestone 1: Extension Skeleton

Goal: Installable VS Code extension with commands and test harness.

Tasks:

- Initialize TypeScript VS Code extension project.
- Add commands:
  - `continuity.startTask`
  - `continuity.snapshotTask`
  - `continuity.continueTask`
  - `continuity.endTask`
- Add activation events for commands.
- Add StatusBar item.
- Add basic extension settings.
- Add lint, format, unit test, and package scripts.

Acceptance criteria:

- Extension launches in Extension Development Host.
- Commands appear in Command Palette.
- Status bar appears only when a task is active.
- `npm run compile` and `npm test` run successfully.

### Milestone 2: Local Storage

Goal: Durable per-workspace task storage.

Tasks:

- Add `sql.js`.
- Initialize database in `context.globalStorageUri`.
- Create migrations for `task`, `event`, and `file_edit`.
- Persist database to disk after writes.
- Implement repository methods:
  - `createTask(name, goal)`
  - `getActiveTask()`
  - `endActiveTask()`
  - `addEvent(taskId, type, content, metadata)`
  - `addFileEdit(taskId, filePath, diff)`
  - `getTaskContext(taskId)`

Acceptance criteria:

- A task survives VS Code reload.
- Only one active task exists for MVP.
- Corrupt or missing database fails gracefully with a user-visible message.

### Milestone 3: Task Lifecycle UI

Goal: A developer can start, see, and stop a task.

Tasks:

- Implement start task flow with `showInputBox`.
- Store goal as both task name and goal event for MVP, or ask optional second prompt later.
- Show active task in status bar.
- Add status bar click menu with continue, snapshot, and end task.
- Implement end task command.

Acceptance criteria:

- Starting a task immediately updates the status bar.
- Ending a task removes the active status bar.
- Reloading VS Code restores active task state.

### Milestone 4: File Capture

Goal: Record meaningful file edits without overwhelming storage.

Tasks:

- Listen to `workspace.onDidChangeTextDocument`.
- Ignore untitled files, extension output, binary-like files, and files outside workspace folders.
- Keep previous document text in memory for open documents.
- Generate unified patch snippets with `diff`.
- Debounce writes per file, default 3 seconds.
- Limit each diff snippet size, for example 20 KB.
- Add settings for enable/disable and max diff size.

Acceptance criteria:

- Editing a workspace file records a `file_edit`.
- Non-workspace files are ignored.
- Large diffs are truncated clearly.
- File capture does not noticeably slow typing.

### Milestone 5: Manual Snapshot

Goal: Store chat context explicitly and reliably.

Tasks:

- Read selected text from active editor when available.
- If no selected text exists, show an input/paste flow.
- Store raw snapshot as an `event` of type `snapshot`.
- Show a short confirmation after saving.
- Include snapshot metadata such as source and character count.

Acceptance criteria:

- Selected text becomes a snapshot event.
- Paste fallback works when there is no editor selection.
- Empty snapshots are rejected.

### Milestone 6: Prompt Handoff

Goal: Generate useful assistant-neutral handoff prompts.

Tasks:

- Implement `promptEngine.ts` as a pure module.
- Include task name, goal, touched files, last activity time, last 3 diffs per file, latest snapshots, decisions, assumptions, and pending events.
- For MVP, decisions/assumptions/pending may be manually absent.
- Add token/length budgeting:
  - Keep the prompt below a configurable max character limit.
  - Prefer latest snapshots and diffs.
  - Truncate large diffs with clear markers.
- Implement clipboard delivery.
- Add QuickPick for target assistant labels, even if delivery is clipboard-only.

Acceptance criteria:

- `continuity.continueTask` copies a structured Markdown prompt to clipboard.
- Prompt contains touched files and recent diffs.
- Prompt remains usable even when no diffs or snapshots exist.
- Unit tests cover prompt ordering and truncation.

### Milestone 7: Alpha Hardening

Goal: Make the MVP stable enough for private users.

Tasks:

- Add README with setup, privacy posture, and known limitations.
- Add `.vscodeignore`.
- Add CI for compile and tests.
- Package with `vsce`.
- Test in fresh VS Code profile.
- Test with at least Copilot Chat and one external AI extension installed.
- Add diagnostic logging via VS Code OutputChannel without sensitive content.

Acceptance criteria:

- Installable `.vsix` works on a clean machine.
- No secrets or code content are logged.
- The core handoff flow works from a real workspace.

## Post-MVP Roadmap

### Phase A: AI Decision Extraction

Add only after the manual handoff loop is stable.

Work items:

- `continuity.configureAIService` command.
- SecretStorage wrapper for API keys.
- DeepSeek client with JSON-mode response validation.
- Consent gate before first network call.
- Retry once on malformed JSON.
- Events written as `decision`, `assumption`, and `pending`.
- Settings for provider, model, offline mode, and auto-extract after snapshot.

Key acceptance criteria:

- No network request occurs without explicit consent.
- API key never appears in settings, logs, or generated prompts.
- Malformed responses do not corrupt task history.

### Phase B: Local Ollama Extraction

Work items:

- Provider abstraction shared by DeepSeek and Ollama.
- Local endpoint setting, default `http://localhost:11434`.
- Timeout and model availability handling.
- Feature flag if tied to Pro tier.

Key acceptance criteria:

- Works offline against a running Ollama server.
- Clear error when Ollama is not running.
- Same JSON event output as cloud extraction.

### Phase C: Rich Timeline Panel

Work items:

- Webview panel showing task timeline.
- File tree of touched files.
- Snapshot and extracted decision views.
- One-click copy handoff prompt.
- Basic task switching if multiple tasks are introduced.

Key acceptance criteria:

- Panel reads from repository APIs, not separate state.
- UI remains useful without AI extraction enabled.

### Phase D: Commercialization

Work items:

- Decide licensing backend: Marketplace entitlement, Gumroad, Paddle, or custom API.
- License state service.
- Feature flags for Pro-only features.
- Clear in-product upgrade messaging.
- Privacy policy and terms.

Key acceptance criteria:

- Free path remains valuable.
- License failures do not break local free features.
- No paid-cloud AI call can happen accidentally.

## Technical Decisions To Lock Early

- Use `context.globalStorageUri` for database storage in MVP, with workspace identity encoded in the database filename.
- Use clipboard handoff as the only guaranteed delivery method.
- Keep file diffs local and never send them to AI extraction providers by default.
- Implement prompt building as a pure function with strict tests.
- Keep only one active task in MVP. Multiple tasks can be added after the first alpha.
- Use SecretStorage for every credential.
- Use OutputChannel logging with redaction and no captured content.

## Suggested Initial Backlog

### P0

- Scaffold extension.
- Add start/end/continue commands.
- Add sql.js storage and migrations.
- Add active task repository.
- Add status bar.
- Add file edit capture with debounced writes.
- Add prompt generation and clipboard delivery.
- Add README and `.vscodeignore`.
- Add basic tests and CI.

### P1

- Manual snapshot paste fallback.
- Prompt length budgeting.
- Assistant-specific QuickPick labels.
- OutputChannel diagnostics.
- VSIX packaging.
- Fresh-profile install test.

### P2

- DeepSeek BYOK extraction.
- Consent and offline mode.
- Ollama provider.
- Timeline webview.
- Multiple task switching.
- Custom prompt templates.

## First 10 Engineering Tickets

1. Scaffold TypeScript VS Code extension and scripts.
2. Define extension commands and package contributions.
3. Implement SQLite database initialization and migrations.
4. Implement `TaskRepository` with active-task lifecycle.
5. Implement Start Task and End Task commands.
6. Implement active-task StatusBar item.
7. Implement file watcher with debounced diff capture.
8. Implement snapshot command with selection and paste fallback.
9. Implement prompt engine and clipboard delivery.
10. Add tests, README, `.vscodeignore`, and VSIX packaging.

## MVP Release Checklist

- Compile passes.
- Unit tests pass.
- Extension runs in Extension Development Host.
- Fresh VS Code profile install works from `.vsix`.
- Start task creates durable task record.
- Editing files records diffs.
- Snapshot command stores selected or pasted text.
- Continue command copies useful handoff prompt.
- Prompt contains no API keys or internal storage paths.
- Offline mode is documented, even before AI features.
- README includes privacy explanation and known limitations.

## Main Product Risk

The main risk is not implementation complexity. It is whether the generated handoff is concise enough to paste into a new assistant while still carrying the important mental model.

The MVP should therefore prioritize prompt quality and task history usefulness over automation. If the handoff prompt is excellent, clipboard delivery is acceptable. If the handoff prompt is weak, deeper assistant integration will not save the product.
