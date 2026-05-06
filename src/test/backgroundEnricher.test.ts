/**
 * Tests for the BackgroundEnricher's gating logic — when does it fire,
 * when does it stay quiet, and what does it persist?
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldEnrich } from '../capture/enrichmentGate';
import { FileEdit, Task, TaskContext, TaskEvent } from '../types';

const baseTask: Task = {
  id: 't1',
  name: 'Session — 2026-05-05',
  status: 'active',
  createdAt: '2026-05-05T10:00:00Z',
  updatedAt: '2026-05-05T10:30:00Z'
};

function makeEdit(filePath: string, id: number): FileEdit {
  return {
    id,
    taskId: 't1',
    filePath,
    diff: `@@ -1 +1 @@\n-old\n+new ${id}`,
    timestamp: '2026-05-05T10:15:00Z'
  };
}

function makeEvent(type: TaskEvent['type'], content: string, id = 1): TaskEvent {
  return { id, taskId: 't1', type, content, timestamp: '2026-05-05T10:10:00Z' };
}

test('shouldEnrich: fires when no structured content + 3+ distinct files + never enriched', () => {
  const ctx: TaskContext = {
    task: baseTask,
    events: [],
    fileEdits: [
      makeEdit('src/a.ts', 1),
      makeEdit('src/b.ts', 2),
      makeEdit('src/c.ts', 3)
    ]
  };
  assert.equal(shouldEnrich(ctx, undefined, undefined), true);
});

test('shouldEnrich: does NOT fire with only 2 distinct files (insufficient signal)', () => {
  const ctx: TaskContext = {
    task: baseTask,
    events: [],
    fileEdits: [
      makeEdit('src/a.ts', 1),
      makeEdit('src/a.ts', 2),
      makeEdit('src/b.ts', 3)
    ]
  };
  assert.equal(shouldEnrich(ctx, undefined, undefined), false);
});

test('shouldEnrich: does NOT fire on empty context', () => {
  const ctx: TaskContext = { task: baseTask, events: [], fileEdits: [] };
  assert.equal(shouldEnrich(ctx, undefined, undefined), false);
});

test('shouldEnrich: does NOT fire on first pass when user has captured a decision', () => {
  const ctx: TaskContext = {
    task: baseTask,
    events: [makeEvent('decision', 'Use JWT refresh rotation')],
    fileEdits: [
      makeEdit('src/a.ts', 1),
      makeEdit('src/b.ts', 2),
      makeEdit('src/c.ts', 3)
    ]
  };
  // User has captured something — first pass shouldn't auto-fill
  assert.equal(shouldEnrich(ctx, undefined, undefined), false);
});

test('shouldEnrich: does NOT fire on first pass when user has captured a pending', () => {
  const ctx: TaskContext = {
    task: baseTask,
    events: [makeEvent('pending', 'Add error handling')],
    fileEdits: [
      makeEdit('src/a.ts', 1),
      makeEdit('src/b.ts', 2),
      makeEdit('src/c.ts', 3)
    ]
  };
  assert.equal(shouldEnrich(ctx, undefined, undefined), false);
});

test('shouldEnrich: does NOT fire when within cooldown window', () => {
  const ctx: TaskContext = {
    task: baseTask,
    events: [makeEvent('decision', 'AI-inferred decision')],
    fileEdits: [
      makeEdit('src/a.ts', 1),
      makeEdit('src/b.ts', 2),
      makeEdit('src/c.ts', 3),
      makeEdit('src/d.ts', 4),
      makeEdit('src/e.ts', 5),
      makeEdit('src/f.ts', 6)
    ]
  };
  // Last enriched 2 minutes ago — too recent
  const recentlyEnriched = Date.now() - 2 * 60 * 1000;
  assert.equal(shouldEnrich(ctx, recentlyEnriched, 3), false);
});

test('shouldEnrich: fires after cooldown window AND enough new edits', () => {
  const ctx: TaskContext = {
    task: baseTask,
    events: [makeEvent('decision', 'Earlier decision')],
    fileEdits: [
      makeEdit('src/a.ts', 1),
      makeEdit('src/b.ts', 2),
      makeEdit('src/c.ts', 3),
      makeEdit('src/d.ts', 4),
      makeEdit('src/e.ts', 5),
      makeEdit('src/f.ts', 6)
    ]
  };
  // Last enriched 15 minutes ago, was at 3 edits → 3 new edits since
  const longAgo = Date.now() - 15 * 60 * 1000;
  assert.equal(shouldEnrich(ctx, longAgo, 3), true);
});

test('shouldEnrich: does NOT fire after cooldown if new edits are insufficient', () => {
  const ctx: TaskContext = {
    task: baseTask,
    events: [makeEvent('decision', 'Earlier decision')],
    fileEdits: [
      makeEdit('src/a.ts', 1),
      makeEdit('src/b.ts', 2),
      makeEdit('src/c.ts', 3),
      makeEdit('src/d.ts', 4)
    ]
  };
  // Last enriched 15 minutes ago, was at 3 edits → only 1 new edit, not enough
  const longAgo = Date.now() - 15 * 60 * 1000;
  assert.equal(shouldEnrich(ctx, longAgo, 3), false);
});

test('shouldEnrich: does NOT fire when only file_change events exist (auto-tracking, not decisions)', () => {
  const ctx: TaskContext = {
    task: baseTask,
    events: [
      makeEvent('file_change', 'Changed src/a.ts'),
      makeEvent('file_change', 'Changed src/b.ts'),
      makeEvent('file_change', 'Changed src/c.ts')
    ],
    fileEdits: [
      makeEdit('src/a.ts', 1),
      makeEdit('src/b.ts', 2),
      makeEdit('src/c.ts', 3)
    ]
  };
  // file_change events shouldn't count as "user has captured decisions"
  assert.equal(shouldEnrich(ctx, undefined, undefined), true);
});

test('shouldEnrich: does NOT fire when goal events exist but no decisions/assumptions/pending (goal alone is normal)', () => {
  // This documents current behavior: a goal event from createTask doesn't
  // count as structured content for enrichment-gating purposes.
  const ctx: TaskContext = {
    task: baseTask,
    events: [
      makeEvent('goal', 'Session — 2026-05-05')
    ],
    fileEdits: [
      makeEdit('src/a.ts', 1),
      makeEdit('src/b.ts', 2),
      makeEdit('src/c.ts', 3)
    ]
  };
  assert.equal(shouldEnrich(ctx, undefined, undefined), true);
});
