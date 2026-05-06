/**
 * Tests for workspace-scoped database isolation.
 * Verifies that two VS Code windows on different projects get independent
 * sessions, captures, and active tasks — they never cross-contaminate.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ContinuityDatabase } from '../storage/db';
import { TaskRepository } from '../storage/taskRepository';

// sql.js WASM lives next to the compiled extension output
const WASM_DIR = path.resolve(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function makeWorkspace(name: string): Promise<{ db: ContinuityDatabase; repo: TaskRepository; dir: string }> {
  const dir = path.join(os.tmpdir(), `continuity-test-${name}-${Date.now()}`);
  await fs.mkdir(dir, { recursive: true });
  const db = new ContinuityDatabase();
  await db.initializeAtPath(dir, WASM_DIR);
  const repo = new TaskRepository(db);
  return { db, repo, dir };
}

async function cleanup(dir: string, db: ContinuityDatabase): Promise<void> {
  db.dispose();
  await fs.rm(dir, { recursive: true, force: true });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('each workspace starts with no active session', async () => {
  const ws1 = await makeWorkspace('project-a');
  const ws2 = await makeWorkspace('project-b');
  try {
    assert.equal(await ws1.repo.getActiveTask(), undefined);
    assert.equal(await ws2.repo.getActiveTask(), undefined);
  } finally {
    await cleanup(ws1.dir, ws1.db);
    await cleanup(ws2.dir, ws2.db);
  }
});

test('active task in workspace-A is not visible in workspace-B', async () => {
  const ws1 = await makeWorkspace('project-a');
  const ws2 = await makeWorkspace('project-b');
  try {
    await ws1.repo.createTask('Feature: auth refresh');

    const taskInA = await ws1.repo.getActiveTask();
    const taskInB = await ws2.repo.getActiveTask();

    assert.ok(taskInA, 'workspace A should have an active task');
    assert.equal(taskInA!.name, 'Feature: auth refresh');
    assert.equal(taskInB, undefined, 'workspace B should see no task');
  } finally {
    await cleanup(ws1.dir, ws1.db);
    await cleanup(ws2.dir, ws2.db);
  }
});

test('each workspace can have its own independent active task simultaneously', async () => {
  const ws1 = await makeWorkspace('project-a');
  const ws2 = await makeWorkspace('project-b');
  try {
    await ws1.repo.createTask('Auth service refactor');
    await ws2.repo.createTask('Rolling ball animation');

    const taskA = await ws1.repo.getActiveTask();
    const taskB = await ws2.repo.getActiveTask();

    assert.equal(taskA!.name, 'Auth service refactor');
    assert.equal(taskB!.name, 'Rolling ball animation');
    assert.notEqual(taskA!.id, taskB!.id);
  } finally {
    await cleanup(ws1.dir, ws1.db);
    await cleanup(ws2.dir, ws2.db);
  }
});

test('file edits captured in workspace-A do not appear in workspace-B context', async () => {
  const ws1 = await makeWorkspace('project-a');
  const ws2 = await makeWorkspace('project-b');
  try {
    const taskA = await ws1.repo.createTask('Project A work');
    const taskB = await ws2.repo.createTask('Project B work');

    await ws1.repo.addFileEdit(taskA.id, 'src/auth.ts', '+const refresh = true;');
    await ws1.repo.addFileEdit(taskA.id, 'src/tokens.ts', '+export function rotate() {}');

    await ws2.repo.addFileEdit(taskB.id, 'server.js', '+app.listen(3000)');

    const ctxA = await ws1.repo.getTaskContext(taskA.id);
    const ctxB = await ws2.repo.getTaskContext(taskB.id);

    // A has its own files only
    assert.equal(ctxA!.fileEdits.length, 2);
    assert.ok(ctxA!.fileEdits.some(e => e.filePath === 'src/auth.ts'));
    assert.ok(ctxA!.fileEdits.some(e => e.filePath === 'src/tokens.ts'));
    assert.ok(!ctxA!.fileEdits.some(e => e.filePath === 'server.js'));

    // B has its own files only
    assert.equal(ctxB!.fileEdits.length, 1);
    assert.ok(ctxB!.fileEdits.some(e => e.filePath === 'server.js'));
    assert.ok(!ctxB!.fileEdits.some(e => e.filePath === 'src/auth.ts'));
  } finally {
    await cleanup(ws1.dir, ws1.db);
    await cleanup(ws2.dir, ws2.db);
  }
});

test('ending session in workspace-A does not affect workspace-B session', async () => {
  const ws1 = await makeWorkspace('project-a');
  const ws2 = await makeWorkspace('project-b');
  try {
    await ws1.repo.createTask('Temporary A task');
    await ws2.repo.createTask('Ongoing B task');

    await ws1.repo.endActiveTask();

    const taskA = await ws1.repo.getActiveTask();
    const taskB = await ws2.repo.getActiveTask();

    assert.equal(taskA, undefined, 'workspace A session should be ended');
    assert.ok(taskB, 'workspace B session should still be active');
    assert.equal(taskB!.name, 'Ongoing B task');
  } finally {
    await cleanup(ws1.dir, ws1.db);
    await cleanup(ws2.dir, ws2.db);
  }
});

test('snapshots and decisions saved in workspace-A are isolated from workspace-B', async () => {
  const ws1 = await makeWorkspace('project-a');
  const ws2 = await makeWorkspace('project-b');
  try {
    const taskA = await ws1.repo.createTask('Task A');
    const taskB = await ws2.repo.createTask('Task B');

    await ws1.repo.addEvent(taskA.id, 'decision', 'Use JWT refresh rotation');
    await ws1.repo.addEvent(taskA.id, 'snapshot', 'AI said: use short-lived tokens');
    await ws2.repo.addEvent(taskB.id, 'pending', 'Add mobile touch support');

    const ctxA = await ws1.repo.getTaskContext(taskA.id);
    const ctxB = await ws2.repo.getTaskContext(taskB.id);

    const decisionsA = ctxA!.events.filter(e => e.type === 'decision');
    const decisionsB = ctxB!.events.filter(e => e.type === 'decision');
    const pendingB = ctxB!.events.filter(e => e.type === 'pending');

    assert.equal(decisionsA.length, 1);
    assert.equal(decisionsA[0].content, 'Use JWT refresh rotation');
    assert.equal(decisionsB.length, 0, 'workspace B should have no decisions from A');
    assert.equal(pendingB.length, 1);
    assert.equal(pendingB[0].content, 'Add mobile touch support');
  } finally {
    await cleanup(ws1.dir, ws1.db);
    await cleanup(ws2.dir, ws2.db);
  }
});

test('database persists to disk and reloads correctly across restarts', async () => {
  const dir = path.join(os.tmpdir(), `continuity-persist-${Date.now()}`);
  await fs.mkdir(dir, { recursive: true });

  // First "session" — write a task
  const db1 = new ContinuityDatabase();
  await db1.initializeAtPath(dir, WASM_DIR);
  const repo1 = new TaskRepository(db1);
  const task = await repo1.createTask('Persist across restart');
  await repo1.addEvent(task.id, 'decision', 'Use IndexedDB for token storage');
  db1.dispose();

  // Second "session" — same path, simulates VS Code restart
  const db2 = new ContinuityDatabase();
  await db2.initializeAtPath(dir, WASM_DIR);
  const repo2 = new TaskRepository(db2);

  const reloaded = await repo2.getActiveTask();
  assert.ok(reloaded, 'task should survive restart');
  assert.equal(reloaded!.name, 'Persist across restart');

  const ctx = await repo2.getTaskContext(reloaded!.id);
  const decisions = ctx!.events.filter(e => e.type === 'decision');
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].content, 'Use IndexedDB for token storage');

  db2.dispose();
  await fs.rm(dir, { recursive: true, force: true });
});
