import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHandoffPrompt } from '../injection/promptEngine';
import { FileEdit, Task, TaskContext, TaskEvent } from '../types';

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

test('buildHandoffPrompt includes task name, goal and target assistant', () => {
  const ctx: TaskContext = {
    task: baseTask,
    events: [makeEvent({ type: 'goal', content: 'Token survives restart' })],
    fileEdits: []
  };
  const prompt = buildHandoffPrompt(ctx, { maxChars: 5000, targetAssistant: 'Gemini', isFreeMode: false });
  assert.match(prompt, /Task: Fix auth refresh bug/);
  assert.match(prompt, /Goal: Token survives restart/);
  assert.match(prompt, /Target assistant: Gemini/);
});

test('buildHandoffPrompt drops goal line when no goal events exist', () => {
  const ctx: TaskContext = { task: baseTask, events: [], fileEdits: [] };
  const prompt = buildHandoffPrompt(ctx, { maxChars: 5000, isFreeMode: true });
  assert.doesNotMatch(prompt, /^Goal: /m);
});

test('buildHandoffPrompt drops goal line when only system-created goal (source: startTask) exists', () => {
  // createTask() auto-inserts a goal event with source: 'startTask' — should be treated as auto-generated
  const ctx: TaskContext = {
    task: baseTask,
    events: [makeEvent({
      type: 'goal',
      content: 'Fix auth refresh bug',   // same as task name
      metadata: JSON.stringify({ source: 'startTask' })
    })],
    fileEdits: []
  };
  const prompt = buildHandoffPrompt(ctx, { maxChars: 5000, isFreeMode: true });
  assert.doesNotMatch(prompt, /^Goal: /m);
});

test('buildHandoffPrompt shows goal line when user explicitly renamed the session', () => {
  const ctx: TaskContext = {
    task: { ...baseTask, name: 'Renamed' },
    events: [makeEvent({
      type: 'goal',
      content: 'Implement token refresh with rotation',
      metadata: JSON.stringify({ source: 'rename' })
    })],
    fileEdits: []
  };
  const prompt = buildHandoffPrompt(ctx, { maxChars: 5000, isFreeMode: true });
  assert.match(prompt, /Goal: Implement token refresh with rotation/);
});

test('buildHandoffPrompt uses 2-level directory for smart session name', () => {
  const ctx: TaskContext = {
    task: { ...baseTask, name: 'MyProject — 2026-05-05 12:00' },
    events: [makeEvent({ type: 'goal', content: 'MyProject — 2026-05-05 12:00', metadata: JSON.stringify({ source: 'startTask' }) })],
    fileEdits: [
      makeFileEdit({ filePath: 'src/ai/index.ts', diff: '+x' }),
      makeFileEdit({ filePath: 'src/ai/openrouter.ts', diff: '+y', id: 2 }),
      makeFileEdit({ filePath: 'src/commands/configureAI.ts', diff: '+z', id: 3 }),
    ]
  };
  const prompt = buildHandoffPrompt(ctx, { maxChars: 10000, isFreeMode: true });
  // Should show most-edited 2-level dir, not the workspace folder name
  assert.match(prompt, /src\/ai/);
  assert.doesNotMatch(prompt, /MyProject/);
});

test('buildHandoffPrompt groups diffs by file and limits each to 1 in Free mode, 3 in Pro mode', () => {
  const edits: FileEdit[] = Array.from({ length: 5 }, (_, i) =>
    makeFileEdit({
      id: i,
      filePath: 'src/auth.ts',
      diff: `diff body ${i}`,
      timestamp: `2026-05-05T10:1${i}:00Z`
    })
  );
  const ctx: TaskContext = { task: baseTask, events: [makeEvent({ type: 'decision', content: 'test' })], fileEdits: edits };

  // Free mode shows 1 diff per file
  const freeModePrompt = buildHandoffPrompt(ctx, { maxChars: 10000, isFreeMode: true });
  assert.match(freeModePrompt, /File: src\/auth\.ts/);
  assert.match(freeModePrompt, /diff body 4/);
  assert.doesNotMatch(freeModePrompt, /diff body 3/);

  // Pro mode shows 3 diffs per file
  const proModePrompt = buildHandoffPrompt(ctx, { maxChars: 10000, isFreeMode: false });
  assert.match(proModePrompt, /File: src\/auth\.ts/);
  assert.match(proModePrompt, /diff body 4/);
  assert.match(proModePrompt, /diff body 3/);
  assert.match(proModePrompt, /diff body 2/);
  assert.doesNotMatch(proModePrompt, /diff body 0/);
  assert.doesNotMatch(proModePrompt, /diff body 1/);
});

test('buildHandoffPrompt enforces character budget with truncation marker', () => {
  const events: TaskEvent[] = Array.from({ length: 200 }, (_, i) =>
    makeEvent({ id: i, type: 'decision', content: `decision-${i}-${'x'.repeat(40)}` })
  );
  const ctx: TaskContext = { task: baseTask, events, fileEdits: [] };
  const prompt = buildHandoffPrompt(ctx, { maxChars: 800 });
  assert.ok(prompt.length <= 800, `prompt length ${prompt.length} exceeds budget`);
  assert.match(prompt, /truncated/i);
});

test('buildHandoffPrompt in Free mode shows helpful message for empty context', () => {
  const ctx: TaskContext = { task: { ...baseTask, name: 'Empty' }, events: [], fileEdits: [] };
  const prompt = buildHandoffPrompt(ctx, { maxChars: 5000, isFreeMode: true });
  assert.match(prompt, /Free tier handoff/);
  assert.match(prompt, /nothing captured yet/);
});

test('buildHandoffPrompt in Free mode shows diffs and hint when only diffs exist', () => {
  const ctx: TaskContext = {
    task: baseTask,
    events: [],
    fileEdits: [makeFileEdit({ filePath: 'public/script.js', diff: '+const x = 1;' })]
  };
  const prompt = buildHandoffPrompt(ctx, { maxChars: 10000, isFreeMode: true });
  assert.match(prompt, /Recent file diffs/);
  assert.match(prompt, /public\/script\.js/);
  assert.match(prompt, /Free mode/);
});

test('buildHandoffPrompt only shows the latest 3 snapshots when there is other content', () => {
  const events: TaskEvent[] = [
    makeEvent({ id: 0, type: 'pending', content: 'finish tests', timestamp: '2026-05-05T10:00:00Z' }),
    ...Array.from({ length: 5 }, (_, i) =>
      makeEvent({ id: i + 1, type: 'snapshot', content: `snap-${i}`, timestamp: `2026-05-05T10:0${i}:00Z` })
    )
  ];
  const ctx: TaskContext = { task: baseTask, events, fileEdits: [] };
  const prompt = buildHandoffPrompt(ctx, { maxChars: 10000, isFreeMode: true });
  assert.match(prompt, /snap-4/);
  assert.match(prompt, /snap-3/);
  assert.match(prompt, /snap-2/);
  assert.doesNotMatch(prompt, /snap-0\b/);
  assert.doesNotMatch(prompt, /snap-1\b/);
});
