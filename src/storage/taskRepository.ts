import { randomUUID } from 'crypto';
import { SqlValue } from 'sql.js';
import { CamsDatabase } from './db';
import { EventType, FileEdit, Task, TaskContext, TaskEvent } from '../types';

interface TaskRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: number;
  task_id: string;
  type: string;
  content: string;
  metadata: string | null;
  timestamp: string;
}

interface FileEditRow {
  id: number;
  task_id: string;
  file_path: string;
  diff: string;
  timestamp: string;
}

export class TaskRepository {
  constructor(private readonly db: CamsDatabase) {}

  async createTask(name: string): Promise<Task> {
    const now = new Date().toISOString();
    const id = randomUUID();
    const database = this.db.database;

    database.run('BEGIN TRANSACTION;');
    try {
      database.run("UPDATE task SET status = 'completed', updated_at = ? WHERE status = 'active';", [now]);
      database.run(
        'INSERT INTO task (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?);',
        [id, name, 'active', now, now]
      );
      database.run(
        'INSERT INTO event (task_id, type, content, metadata, timestamp) VALUES (?, ?, ?, ?, ?);',
        [id, 'goal', name, JSON.stringify({ source: 'startTask' }), now]
      );
      database.run('COMMIT;');
    } catch (error) {
      database.run('ROLLBACK;');
      throw error;
    }

    await this.db.persist();
    return { id, name, status: 'active', createdAt: now, updatedAt: now };
  }

  async getActiveTask(): Promise<Task | undefined> {
    const rows = this.selectRows<TaskRow>(
      "SELECT id, name, status, created_at, updated_at FROM task WHERE status = 'active' ORDER BY updated_at DESC LIMIT 1;"
    );
    return rows[0] ? mapTask(rows[0]) : undefined;
  }

  async endActiveTask(): Promise<void> {
    const now = new Date().toISOString();
    this.db.database.run("UPDATE task SET status = 'completed', updated_at = ? WHERE status = 'active';", [now]);
    await this.db.persist();
  }

  async renameTask(taskId: string, name: string): Promise<void> {
    const now = new Date().toISOString();
    this.db.database.run('UPDATE task SET name = ?, updated_at = ? WHERE id = ?;', [name, now, taskId]);
    await this.db.persist();
  }

  async addEvent(taskId: string, type: EventType, content: string, metadata?: unknown): Promise<void> {
    const now = new Date().toISOString();
    this.db.database.run(
      'INSERT INTO event (task_id, type, content, metadata, timestamp) VALUES (?, ?, ?, ?, ?);',
      [taskId, type, content, metadata === undefined ? null : JSON.stringify(metadata), now]
    );
    this.touchTask(taskId, now);
    await this.db.persist();
  }

  async addFileEdit(taskId: string, filePath: string, diff: string): Promise<void> {
    const now = new Date().toISOString();
    const database = this.db.database;
    database.run('INSERT INTO file_edit (task_id, file_path, diff, timestamp) VALUES (?, ?, ?, ?);', [
      taskId,
      filePath,
      diff,
      now
    ]);
    database.run(
      'INSERT INTO event (task_id, type, content, metadata, timestamp) VALUES (?, ?, ?, ?, ?);',
      [taskId, 'file_change', `Changed ${filePath}`, JSON.stringify({ filePath }), now]
    );
    this.touchTask(taskId, now);
    await this.db.persist();
  }

  async getTaskContext(taskId: string): Promise<TaskContext | undefined> {
    const taskRows = this.selectRows<TaskRow>(
      'SELECT id, name, status, created_at, updated_at FROM task WHERE id = ? LIMIT 1;',
      [taskId]
    );
    if (!taskRows[0]) {
      return undefined;
    }

    const events = this.selectRows<EventRow>(
      'SELECT id, task_id, type, content, metadata, timestamp FROM event WHERE task_id = ? ORDER BY timestamp ASC, id ASC;',
      [taskId]
    ).map(mapEvent);

    const fileEdits = this.selectRows<FileEditRow>(
      'SELECT id, task_id, file_path, diff, timestamp FROM file_edit WHERE task_id = ? ORDER BY timestamp ASC, id ASC;',
      [taskId]
    ).map(mapFileEdit);

    return {
      task: mapTask(taskRows[0]),
      events,
      fileEdits
    };
  }

  private touchTask(taskId: string, timestamp: string): void {
    this.db.database.run('UPDATE task SET updated_at = ? WHERE id = ?;', [timestamp, taskId]);
  }

  private selectRows<T>(sql: string, params: SqlValue[] = []): T[] {
    const stmt = this.db.database.prepare(sql);
    try {
      stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
      return rows;
    } finally {
      stmt.free();
    }
  }
}

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    name: row.name,
    status: row.status as Task['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapEvent(row: EventRow): TaskEvent {
  return {
    id: row.id,
    taskId: row.task_id,
    type: row.type as EventType,
    content: row.content,
    metadata: row.metadata ?? undefined,
    timestamp: row.timestamp
  };
}

function mapFileEdit(row: FileEditRow): FileEdit {
  return {
    id: row.id,
    taskId: row.task_id,
    filePath: row.file_path,
    diff: row.diff,
    timestamp: row.timestamp
  };
}
