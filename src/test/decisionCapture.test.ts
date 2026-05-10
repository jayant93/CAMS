/**
 * Integration tests for decision capture in Free vs Pro mode.
 * Uses a mock AI provider — no real API key required.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHandoffPrompt } from '../injection/promptEngine';
import { applyEnrichment } from '../injection/enrichmentContext';
import { dedupeAgainstExisting } from '../ai/enrichment';
import { AIProvider } from '../ai/types';
import { ExtractionResult, FileEdit, Task, TaskContext, TaskEvent } from '../types';

// ── Mock AI provider ──────────────────────────────────────────────────────────

class MockAIProvider implements AIProvider {
  readonly id = 'mock';
  readonly displayName = 'Mock AI';

  constructor(private readonly result: ExtractionResult) {}

  async extract(_text: string): Promise<ExtractionResult> {
    return this.result;
  }

  async enrichActivity(_text: string): Promise<ExtractionResult> {
    return this.result;
  }

  async inferSessionName(_bundle: string) {
    return { name: 'Mock Session', goal: 'Mock goal for testing' };
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseTask: Task = {
  id: 't1',
  name: 'Rolling Ball App — 2026-05-05 12:42',
  status: 'active',
  createdAt: '2026-05-05T12:42:00Z',
  updatedAt: '2026-05-05T12:43:00Z'
};

function makeEvent(
  type: TaskEvent['type'],
  content: string,
  id = 1,
  timestamp = '2026-05-05T12:43:00Z'
): TaskEvent {
  return { id, taskId: 't1', type, content, timestamp };
}

function makeEdit(filePath: string, diff: string, id = 1): FileEdit {
  return { id, taskId: 't1', filePath, diff, timestamp: '2026-05-05T12:43:00Z' };
}

const rollingBallEdits: FileEdit[] = [
  makeEdit('public/script.js', '+class Ball { ... }', 1),
  makeEdit('server.js', '+app.listen(3000)', 2),
  makeEdit('package.json', '+"express": "^4.18.2"', 3)
];

// ── Free mode: snapshots stored as-is ────────────────────────────────────────

test('Free mode: snapshot text is preserved verbatim, not extracted as decisions', () => {
  const snapshotText = 'We decided to use Express.js for the backend. Pending: add error handling.';

  const ctx: TaskContext = {
    task: baseTask,
    events: [makeEvent('snapshot', snapshotText)],
    fileEdits: rollingBallEdits
  };

  const prompt = buildHandoffPrompt(ctx, { maxChars: 10000, isFreeMode: true });

  // Snapshot preserved verbatim in Free mode
  assert.match(prompt, /Express\.js for the backend/);

  // But NOT parsed into structured decision events
  assert.doesNotMatch(prompt, /^Decisions made:/m);
});

test('Free mode: no "None captured" noise — only sections with content appear', () => {
  const ctx: TaskContext = {
    task: baseTask,
    events: [makeEvent('snapshot', 'User discussed routing approach')],
    fileEdits: rollingBallEdits
  };

  const prompt = buildHandoffPrompt(ctx, { maxChars: 10000, isFreeMode: true });

  // No "None captured" anywhere
  assert.doesNotMatch(prompt, /None captured/);

  // Sections with content exist
  assert.match(prompt, /Recent chat snapshots/);
  assert.match(prompt, /Recent file changes/);
  assert.match(prompt, /Scope:/);
});

test('Free mode: goal line dropped when session name is auto-generated', () => {
  const ctx: TaskContext = { task: baseTask, events: [], fileEdits: rollingBallEdits };
  const prompt = buildHandoffPrompt(ctx, { maxChars: 10000, isFreeMode: true });

  // Task name appears but Goal line is dropped (would just echo the same name)
  assert.match(prompt, /Task:/);
  assert.doesNotMatch(prompt, /^Goal:/m);
});

test('Free mode: session name derived from touched files, not workspace folder', () => {
  const ctx: TaskContext = { task: baseTask, events: [], fileEdits: rollingBallEdits };
  const prompt = buildHandoffPrompt(ctx, { maxChars: 10000, isFreeMode: true });

  // Smart name derived from directories (public/ dir is touched)
  assert.match(prompt, /public \(auto\)/);
  // NOT the raw workspace folder name
  assert.doesNotMatch(prompt, /AITestProject/);
});

// ── Pro mode: AI extracts structured decisions ────────────────────────────────

test('Pro mode: AI-extracted decisions appear under "Decisions made" in handoff', async () => {
  const mockExtraction: ExtractionResult = {
    goal: 'Build a canvas-based rolling ball app',
    decisions: ['Use Express.js for serving static files', 'Canvas 800×400 with friction physics'],
    assumptions: ['Node.js 18+ on target environment'],
    pending: ['Add touch/mobile support', 'Add scoring system']
  };

  const mockProvider = new MockAIProvider(mockExtraction);

  // Simulate what snapshotTask does: call extract() then persist results as events
  const snapshotText = 'We decided to use Express.js. Ball uses friction physics.';
  const extracted = await mockProvider.extract(snapshotText);

  // Build context with extracted events (as persistExtraction would store them)
  const ctx: TaskContext = {
    task: baseTask,
    events: [
      makeEvent('snapshot', snapshotText, 1),
      makeEvent('goal', extracted.goal!, 2),
      ...extracted.decisions.map((d, i) => makeEvent('decision', d, 10 + i)),
      ...extracted.assumptions.map((a, i) => makeEvent('assumption', a, 20 + i)),
      ...extracted.pending.map((p, i) => makeEvent('pending', p, 30 + i))
    ],
    fileEdits: rollingBallEdits
  };

  const prompt = buildHandoffPrompt(ctx, { maxChars: 10000, isFreeMode: false });

  // All structured sections appear in Pro mode
  assert.match(prompt, /Decisions made:/);
  assert.match(prompt, /Use Express\.js for serving static files/);
  assert.match(prompt, /Canvas 800×400 with friction physics/);
  assert.match(prompt, /Assumptions:/);
  assert.match(prompt, /Node\.js 18\+ on target environment/);
  assert.match(prompt, /Pending:/);
  assert.match(prompt, /Add touch\/mobile support/);
  assert.match(prompt, /Goal: Build a canvas-based rolling ball app/);
});

test('Pro mode: auto-handoff enrichment infers decisions from diffs', async () => {
  const mockExtraction: ExtractionResult = {
    decisions: ['Canvas chosen over SVG for performance', 'Bounce damping set to 0.6'],
    assumptions: ['Modern browser with Canvas API'],
    pending: ['Add mobile touch support']
  };

  const mockProvider = new MockAIProvider(mockExtraction);

  // Simulate what autoHandoff does: enrichActivity() from diffs
  const ctx: TaskContext = { task: baseTask, events: [], fileEdits: rollingBallEdits };
  const rawEnriched = await mockProvider.enrichActivity('...bundle...');
  const enriched = dedupeAgainstExisting(rawEnriched, ctx);

  // Apply enrichment creates synthetic events
  const enrichedCtx = applyEnrichment(ctx, enriched);

  const prompt = buildHandoffPrompt(enrichedCtx, { maxChars: 10000, isFreeMode: false });

  // Decisions inferred from diffs appear in the prompt
  assert.match(prompt, /Decisions made:/);
  assert.match(prompt, /Canvas chosen over SVG/);
  assert.match(prompt, /Bounce damping set to 0\.6/);
  assert.match(prompt, /Pending:/);
  assert.match(prompt, /mobile touch support/);
});

test('Pro mode dedup: AI does not repeat items already in context', async () => {
  const existing: TaskContext = {
    task: baseTask,
    events: [makeEvent('decision', 'Use Express.js for serving static files', 1)],
    fileEdits: rollingBallEdits
  };

  const mockExtraction: ExtractionResult = {
    decisions: [
      'use express.js for serving static files', // duplicate (different case)
      'Canvas 800×400 with friction physics'      // new
    ],
    assumptions: [],
    pending: []
  };

  const deduped = dedupeAgainstExisting(mockExtraction, existing);

  // Duplicate dropped, new one kept
  assert.equal(deduped.decisions.length, 1);
  assert.equal(deduped.decisions[0], 'Canvas 800×400 with friction physics');
});

// ── Comparing Free vs Pro output on same context ──────────────────────────────

test('Pro mode shows 3 diffs per file; Free mode shows only 1', () => {
  const manyEdits = Array.from({ length: 5 }, (_, i) =>
    makeEdit('public/script.js', `+change-${i}`, i)
  );
  const ctx: TaskContext = {
    task: baseTask,
    events: [makeEvent('decision', 'Use Canvas API', 1)],
    fileEdits: manyEdits
  };

  const free = buildHandoffPrompt(ctx, { maxChars: 50000, isFreeMode: true });
  const pro = buildHandoffPrompt(ctx, { maxChars: 50000, isFreeMode: false });

  // Pro: has diff 4, 3, 2 (3 most recent)
  assert.match(pro, /change-4/);
  assert.match(pro, /change-3/);
  assert.match(pro, /change-2/);
  assert.doesNotMatch(pro, /change-0/);

  // Free: only diff 4 (latest only)
  assert.match(free, /change-4/);
  assert.doesNotMatch(free, /change-3/);
});

test('Pro mode footer: "Preserve decisions" shown when decisions exist', () => {
  const ctx: TaskContext = {
    task: baseTask,
    events: [makeEvent('decision', 'Use Canvas API', 1)],
    fileEdits: []
  };
  const prompt = buildHandoffPrompt(ctx, { maxChars: 5000, isFreeMode: false });
  assert.match(prompt, /Preserve the existing decisions/);
});

test('Free mode footer: minimal instruction when no decisions exist', () => {
  const ctx: TaskContext = {
    task: baseTask,
    events: [],
    fileEdits: [makeEdit('server.js', '+const x = 1')]
  };
  const prompt = buildHandoffPrompt(ctx, { maxChars: 5000, isFreeMode: true });
  assert.match(prompt, /only authoritative record/);
  assert.doesNotMatch(prompt, /Preserve the existing decisions/);
});
