import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bundleActivityForEnrichment,
  dedupeAgainstExisting,
  hasEnrichableContent
} from '../ai/enrichment';
import { ExtractionResult, FileEdit, Task, TaskContext, TaskEvent } from '../types';

const baseTask: Task = {
  id: 't1',
  name: 'Fix auth refresh bug',
  status: 'active',
  createdAt: '2026-05-05T10:00:00Z',
  updatedAt: '2026-05-05T10:30:00Z'
};

function makeEvent(partial: Partial<TaskEvent> & { type: TaskEvent['type']; content: string }): TaskEvent {
  return {
    id: partial.id ?? 1,
    taskId: partial.taskId ?? 't1',
    type: partial.type,
    content: partial.content,
    metadata: partial.metadata,
    timestamp: partial.timestamp ?? '2026-05-05T10:10:00Z'
  };
}

function makeFileEdit(partial: Partial<FileEdit> & { filePath: string; diff: string }): FileEdit {
  return {
    id: partial.id ?? 1,
    taskId: partial.taskId ?? 't1',
    filePath: partial.filePath,
    diff: partial.diff,
    timestamp: partial.timestamp ?? '2026-05-05T10:15:00Z'
  };
}

test('hasEnrichableContent is true when there are diffs', () => {
  const ctx: TaskContext = {
    task: baseTask,
    events: [],
    fileEdits: [makeFileEdit({ filePath: 'a.ts', diff: 'x' })]
  };
  assert.equal(hasEnrichableContent(ctx), true);
});

test('hasEnrichableContent is true when there are snapshots even without diffs', () => {
  const ctx: TaskContext = {
    task: baseTask,
    events: [makeEvent({ type: 'snapshot', content: 'note' })],
    fileEdits: []
  };
  assert.equal(hasEnrichableContent(ctx), true);
});

test('hasEnrichableContent is false on a fresh empty session', () => {
  const ctx: TaskContext = { task: baseTask, events: [], fileEdits: [] };
  assert.equal(hasEnrichableContent(ctx), false);
});

test('bundleActivityForEnrichment includes session, files, snapshots, and diffs', () => {
  const ctx: TaskContext = {
    task: baseTask,
    events: [
      makeEvent({ type: 'goal', content: 'Token survives restart' }),
      makeEvent({ type: 'snapshot', content: 'User said: store tokens in IndexedDB' })
    ],
    fileEdits: [
      makeFileEdit({ filePath: 'src/auth.ts', diff: '@@ -1 +1 @@\n-old\n+new' }),
      makeFileEdit({ filePath: 'src/tokenStore.ts', diff: '@@ -1 +1 @@\n-localStorage\n+indexedDB' })
    ]
  };

  const bundle = bundleActivityForEnrichment(ctx);
  assert.match(bundle, /Session name: Fix auth refresh bug/);
  assert.match(bundle, /Stated goal: Token survives restart/);
  assert.match(bundle, /Touched files: src\/auth\.ts, src\/tokenStore\.ts/);
  assert.match(bundle, /Snapshot 1:/);
  assert.match(bundle, /store tokens in IndexedDB/);
  assert.match(bundle, /File: src\/auth\.ts/);
  assert.match(bundle, /\+indexedDB/);
});

test('bundleActivityForEnrichment respects 16K char budget', () => {
  const big = 'x'.repeat(50000);
  const ctx: TaskContext = {
    task: baseTask,
    events: [makeEvent({ type: 'snapshot', content: big })],
    fileEdits: Array.from({ length: 30 }, (_, i) =>
      makeFileEdit({
        id: i,
        filePath: `src/file${i}.ts`,
        diff: big,
        timestamp: `2026-05-05T10:${String(i).padStart(2, '0')}:00Z`
      })
    )
  };

  const bundle = bundleActivityForEnrichment(ctx);
  assert.ok(bundle.length <= 16000, `bundle length ${bundle.length} exceeds 16000`);
});

test('bundleActivityForEnrichment caps total diffs and per-file diffs', () => {
  const edits: FileEdit[] = [];
  for (let i = 0; i < 5; i++) {
    edits.push(
      makeFileEdit({
        id: i,
        filePath: 'src/a.ts',
        diff: `diff-a-${i}`,
        timestamp: `2026-05-05T10:0${i}:00Z`
      })
    );
  }
  for (let i = 0; i < 5; i++) {
    edits.push(
      makeFileEdit({
        id: 100 + i,
        filePath: 'src/b.ts',
        diff: `diff-b-${i}`,
        timestamp: `2026-05-05T10:1${i}:00Z`
      })
    );
  }

  const ctx: TaskContext = { task: baseTask, events: [], fileEdits: edits };
  const bundle = bundleActivityForEnrichment(ctx);

  // Per-file cap of 2 most recent → only diff-a-3, diff-a-4 from src/a.ts
  assert.match(bundle, /diff-a-4/);
  assert.match(bundle, /diff-a-3/);
  assert.doesNotMatch(bundle, /diff-a-0\b/);
  assert.doesNotMatch(bundle, /diff-a-1\b/);
});

test('dedupeAgainstExisting drops items already present in events (case-insensitive)', () => {
  const ctx: TaskContext = {
    task: baseTask,
    events: [
      makeEvent({ type: 'decision', content: 'Use JWT refresh rotation' }),
      makeEvent({ type: 'pending', content: 'Write unit tests' })
    ],
    fileEdits: []
  };
  const enriched: ExtractionResult = {
    goal: 'token rotation',
    decisions: ['use jwt refresh rotation', 'switch token store to IndexedDB'],
    assumptions: ['Backend returns 401 on expiry'],
    pending: ['write unit tests', 'add error handling for refresh endpoint']
  };
  const out = dedupeAgainstExisting(enriched, ctx);
  assert.deepEqual(out.decisions, ['switch token store to IndexedDB']);
  assert.deepEqual(out.pending, ['add error handling for refresh endpoint']);
  assert.deepEqual(out.assumptions, ['Backend returns 401 on expiry']);
  assert.equal(out.goal, 'token rotation');
});
