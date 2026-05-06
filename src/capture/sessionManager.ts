import * as vscode from 'vscode';
import { TaskRepository } from '../storage/taskRepository';
import { Task } from '../types';

export class SessionManager {
  constructor(
    private readonly repository: TaskRepository,
    private readonly output: vscode.OutputChannel
  ) {}

  async ensureActiveSession(): Promise<Task> {
    const existing = await this.repository.getActiveTask();
    if (existing) return existing;

    const name = this.deriveSessionName();
    const task = await this.repository.createTask(name);
    this.output.appendLine(`Auto-started session "${task.name}".`);
    return task;
  }

  async renameActive(newName: string): Promise<Task | undefined> {
    const active = await this.repository.getActiveTask();
    if (!active) return undefined;
    const trimmed = newName.trim();
    if (trimmed.length === 0) return active;
    await this.repository.renameTask(active.id, trimmed);
    await this.repository.addEvent(active.id, 'goal', trimmed, { source: 'rename' });
    return { ...active, name: trimmed, updatedAt: new Date().toISOString() };
  }

  async rotateSession(): Promise<Task> {
    await this.repository.endActiveTask();
    return this.ensureActiveSession();
  }

  private deriveSessionName(): string {
    const folder = vscode.workspace.workspaceFolders?.[0];
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    if (folder) return `${folder.name} — ${stamp}`;
    return `Session ${stamp}`;
  }
}
