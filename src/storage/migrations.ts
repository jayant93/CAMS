export const schemaSql = `
CREATE TABLE IF NOT EXISTS task (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES task(id),
  type TEXT NOT NULL CHECK(type IN (
    'goal', 'decision', 'assumption', 'pending', 'snapshot', 'file_change'
  )),
  content TEXT NOT NULL,
  metadata TEXT,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS file_edit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES task(id),
  file_path TEXT NOT NULL,
  diff TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_status ON task(status);
CREATE INDEX IF NOT EXISTS idx_event_task_id ON event(task_id);
CREATE INDEX IF NOT EXISTS idx_file_edit_task_id ON file_edit(task_id);
CREATE INDEX IF NOT EXISTS idx_file_edit_file_path ON file_edit(file_path);
`;
