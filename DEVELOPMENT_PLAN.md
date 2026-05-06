# Continuity Development Plan

Date: 2026-05-05  
Product: Continuity VS Code Extension  
Goal: Build a production-grade MVP that preserves task context across AI assistant switches.

---

## 1. MVP Definition

The MVP must solve one complete workflow:

1. User starts a coding task in VS Code.
2. Continuity tracks touched files and recent diffs locally.
3. User manually saves an AI chat snapshot when needed.
4. Continuity generates a structured handoff prompt.
5. Prompt is copied to clipboard for use in Claude, Gemini, Copilot, Codex, or another assistant.

The MVP should not attempt direct chat injection, licensing, team sync, or rich webview dashboards. Those are post-MVP features.

---

## 2. Engineering Principles

- Local-first by default.
- Clipboard handoff is the reliable cross-assistant delivery mechanism.
- No code or chat text leaves the machine in MVP.
- One active task only in MVP.
- Keep prompt generation pure and heavily tested.
- Store credentials only in VS Code SecretStorage when AI extraction is added later.
- Avoid webviews until the core handoff loop is proven useful.

---

## 3. Proposed Repository Structure

```text
continuity/
├── package.json
├── tsconfig.json
├── src/
│   ├── extension.ts
│   ├── commands/
│   │   ├── startTask.ts
│   │   ├── snapshotTask.ts
│   │   ├── continueTask.ts
│   │   └── endTask.ts
│   ├── capture/
│   │   ├── fileWatcher.ts
│   │   └── chatSnapshot.ts
│   ├── injection/
│   │   ├── promptEngine.ts
│   │   └── delivery.ts
│   ├── storage/
│   │   ├── db.ts
│   │   ├── migrations.ts
│   │   └── taskRepository.ts
│   ├── ui/
│   │   └── statusBar.ts
│   ├── config/
│   │   └── settings.ts
│   └── types.ts
├── test/
│   ├── unit/
│   └── integration/
├── .vscodeignore
└── README.md
```

---

## 4. Milestone Plan

## Milestone 0: Project Scaffold

Target: Day 1

Tasks:

- Scaffold VS Code extension using TypeScript.
- Configure `package.json`, `tsconfig.json`, linting, and test scripts.
- Add command contributions:
  - `continuity.startTask`
  - `continuity.snapshotTask`
  - `continuity.continueTask`
  - `continuity.endTask`
- Add basic activation and deactivation lifecycle.
- Add initial README.

Acceptance criteria:

- Extension opens in VS Code Extension Development Host.
- Commands are visible in Command Palette.
- `npm run compile` succeeds.

---

## Milestone 1: Storage Layer

Target: Days 2-3

Tasks:

- Add `sql.js`.
- Initialize a SQLite database in `context.globalStorageUri`.
- Add schema:
  - `task`
  - `event`
  - `file_edit`
- Add migration runner.
- Implement `TaskRepository`.
- Persist database to disk after writes.

Required repository methods:

- `createTask(name: string): Promise<Task>`
- `getActiveTask(): Promise<Task | undefined>`
- `endActiveTask(): Promise<void>`
- `addEvent(taskId, type, content, metadata?)`
- `addFileEdit(taskId, filePath, diff)`
- `getTaskContext(taskId)`

Acceptance criteria:

- Task data survives VS Code reload.
- Only one active task can exist.
- Storage failures show a clear VS Code error message.

---

## Milestone 2: Task Lifecycle

Target: Days 4-5

Tasks:

- Implement `Start Task` command with `showInputBox`.
- Store task name as the initial goal event.
- Implement `End Task` command.
- Add StatusBar item showing active task.
- Add StatusBar click behavior to expose useful actions.
- Restore active task state on extension activation.

Acceptance criteria:

- Starting a task updates the status bar immediately.
- Ending a task hides or resets the status bar.
- Reloading VS Code restores active task visibility.

---

## Milestone 3: File Edit Capture

Target: Days 6-8

Tasks:

- Implement `workspace.onDidChangeTextDocument` listener.
- Ignore files outside workspace folders.
- Ignore untitled, output, readonly, and binary-like documents.
- Track previous document text for open documents.
- Use `diff` package to generate unified diffs.
- Buffer file edits and flush every 3 seconds.
- Truncate oversized diffs with clear markers.
- Add settings:
  - `continuity.capture.enabled`
  - `continuity.capture.maxDiffChars`
  - `continuity.capture.flushIntervalMs`

Acceptance criteria:

- Editing a workspace file records a file edit.
- Large diffs do not bloat storage.
- Typing performance remains acceptable.
- File capture stops when no active task exists.

---

## Milestone 4: Manual Chat Snapshot

Target: Days 9-10

Tasks:

- Implement `Snapshot Task` command.
- Read selected text from active editor if available.
- If no selection exists, prompt the user to paste context.
- Store snapshot as an `event` with type `snapshot`.
- Add metadata:
  - source
  - character count
  - timestamp
- Reject empty snapshots.

Acceptance criteria:

- Selected text can be saved as a snapshot.
- Paste fallback works.
- Snapshot appears in task context.

---

## Milestone 5: Prompt Engine

Target: Days 11-13

Tasks:

- Implement `promptEngine.ts` as a pure function.
- Include:
  - task name
  - goal
  - touched files
  - latest snapshots
  - recent diffs
  - last activity timestamp
  - pending items, decisions, and assumptions when present
- Add prompt length budgeting.
- Add deterministic ordering:
  - task summary first
  - pending work second
  - decisions and assumptions third
  - files and diffs last
- Add unit tests.

Acceptance criteria:

- Prompt is useful with only a task name.
- Prompt is useful with diffs but no snapshots.
- Prompt is useful with snapshots but no diffs.
- Long diffs are truncated clearly.
- Unit tests cover prompt ordering and truncation.

---

## Milestone 6: Clipboard Handoff

Target: Days 14-15

Tasks:

- Implement `Continue Task` command.
- Add QuickPick for target assistant:
  - Claude
  - Gemini
  - GitHub Copilot
  - Codex
  - Generic Assistant
- Generate assistant-neutral prompt for MVP.
- Copy prompt to clipboard using `vscode.env.clipboard.writeText`.
- Show confirmation message.

Acceptance criteria:

- Running `Continue Task` copies a complete handoff prompt.
- Flow works regardless of installed AI extensions.
- User can paste prompt manually into any assistant.

---

## Milestone 7: MVP Hardening

Target: Days 16-20

Tasks:

- Add unit tests for repository and prompt engine.
- Add integration smoke test for command registration.
- Add OutputChannel diagnostics with sensitive-content redaction.
- Add `.vscodeignore`.
- Package `.vsix` using `vsce`.
- Test in a clean VS Code profile.
- Write README sections:
  - what Continuity does
  - how to use it
  - privacy model
  - known limitations
  - roadmap

Acceptance criteria:

- `.vsix` installs cleanly.
- Core flow works in a real workspace.
- No chat text, diffs, or secrets are logged.
- README is sufficient for alpha users.

---

## 5. MVP Release Checklist

- Extension compiles.
- Tests pass.
- Commands appear in Command Palette.
- Start Task creates a durable task.
- StatusBar reflects active task.
- File edits are captured only during active tasks.
- Snapshot command stores selected or pasted text.
- Continue command copies a structured handoff prompt.
- Prompt includes task, snapshots, touched files, and recent diffs.
- Prompt has sane truncation.
- Extension works offline.
- No network calls exist in MVP.
- Packaged `.vsix` installs in a clean VS Code profile.

---

## 6. Post-MVP Roadmap

## Phase 1: AI Decision Extraction

Add cloud BYOK extraction only after MVP is reliable.

Tasks:

- Add `continuity.configureAIService`.
- Store API key in SecretStorage.
- Add DeepSeek provider.
- Add consent dialog before first external call.
- Add JSON schema validation.
- Store extracted:
  - decisions
  - assumptions
  - pending items
  - refined goal
- Add retry for malformed JSON.

Acceptance criteria:

- No request is sent without consent.
- API key is never written to logs or settings.
- Malformed model output does not corrupt task history.

## Phase 2: Local Ollama Extraction

Tasks:

- Add model provider abstraction.
- Add Ollama provider.
- Add endpoint and model settings.
- Add timeout and availability checks.
- Reuse the same extraction schema as DeepSeek.

Acceptance criteria:

- Works with local Ollama server.
- Fails clearly when Ollama is unavailable.
- No internet connection required.

## Phase 3: Rich Task Panel

Tasks:

- Add webview timeline.
- Show task events, snapshots, touched files, and diffs.
- Add task switcher.
- Add one-click handoff copy.
- Add prompt preview.

Acceptance criteria:

- Panel is read-only at first.
- Panel reflects repository state.
- Handoff can be copied from panel.

## Phase 4: Productization

Tasks:

- Marketplace branding.
- Demo GIF/video.
- Privacy policy.
- Opt-in telemetry.
- License/pro tier strategy.
- Pro feature gates.
- Built-in cloud extraction key if monetized.

Acceptance criteria:

- Free tier remains useful.
- Paid features do not break local workflow.
- Privacy posture is clear and defensible.

---

## 7. Initial Engineering Tickets

1. Scaffold the VS Code extension project.
2. Add command contributions and activation events.
3. Create shared TypeScript types.
4. Implement SQLite initialization with `sql.js`.
5. Add database migrations.
6. Implement `TaskRepository`.
7. Build Start Task and End Task commands.
8. Build active task StatusBar.
9. Implement file watcher and diff capture.
10. Implement debounced file edit flushing.
11. Implement Snapshot Task command.
12. Implement prompt engine.
13. Implement clipboard delivery.
14. Add prompt engine unit tests.
15. Add storage unit tests.
16. Add README and privacy notes.
17. Add `.vscodeignore`.
18. Package and test `.vsix`.
19. Run clean-profile manual test.
20. Prepare private alpha release.

---

## 8. Key Risks

| Risk | Mitigation |
| --- | --- |
| Prompt becomes too long | Add strict prompt budgeting and summarize by recency. |
| File capture hurts performance | Debounce writes and cap diff sizes. |
| AI chat panels cannot be read | Make manual snapshot fast and reliable. |
| Users worry about privacy | Keep MVP fully offline and local-first. |
| SQLite WASM persistence is fragile | Keep DB writes centralized and test reload behavior. |
| Users expect direct assistant injection | Explain clipboard-first design clearly in README. |

---

## 9. Recommended Build Order

Build in this exact order:

1. Extension scaffold.
2. Storage.
3. Task lifecycle.
4. StatusBar.
5. File capture.
6. Snapshot capture.
7. Prompt engine.
8. Clipboard delivery.
9. Tests and packaging.
10. Private alpha.

This order keeps the product testable at every stage and avoids building polish before the core workflow is proven.

