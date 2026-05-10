import * as path from 'path';
import * as vscode from 'vscode';
import { createPatch } from 'diff';
import { getCamsSettings } from '../config/settings';
import { TaskRepository } from '../storage/taskRepository';

interface PendingEdit {
  taskId: string;
  filePath: string;
  before: string;
  after: string;
  timer: NodeJS.Timeout;
}

export class FileWatcher implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly previousText = new Map<string, string>();
  private readonly pendingEdits = new Map<string, PendingEdit>();
  private onAfterFlush?: () => void;

  constructor(
    private readonly repository: TaskRepository,
    private readonly output: vscode.OutputChannel
  ) {}

  /** Register a callback to run after each successful diff flush. */
  setOnAfterFlush(cb: () => void): void {
    this.onAfterFlush = cb;
  }

  start(): void {
    for (const document of vscode.workspace.textDocuments) {
      this.rememberDocument(document);
    }

    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((document) => this.rememberDocument(document)),
      vscode.workspace.onDidCloseTextDocument((document) => this.previousText.delete(document.uri.toString())),
      vscode.workspace.onDidChangeTextDocument((event) => this.onDidChangeTextDocument(event))
    );
  }

  async flushAll(): Promise<void> {
    const edits = [...this.pendingEdits.values()];
    this.pendingEdits.clear();
    for (const edit of edits) {
      clearTimeout(edit.timer);
      await this.flushEdit(edit);
    }
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    for (const edit of this.pendingEdits.values()) {
      clearTimeout(edit.timer);
    }
    this.pendingEdits.clear();
    this.previousText.clear();
  }

  private rememberDocument(document: vscode.TextDocument): void {
    if (!this.shouldCaptureDocument(document)) {
      return;
    }
    this.previousText.set(document.uri.toString(), document.getText());
  }

  private async onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): Promise<void> {
    const settings = getCamsSettings();
    if (!settings.captureEnabled || !this.shouldCaptureDocument(event.document)) {
      return;
    }

    const activeTask = await this.repository.getActiveTask();
    if (!activeTask) {
      this.previousText.set(event.document.uri.toString(), event.document.getText());
      return;
    }

    const uriKey = event.document.uri.toString();
    const before = this.previousText.get(uriKey) ?? '';
    const after = event.document.getText();
    this.previousText.set(uriKey, after);

    if (before === after) {
      return;
    }

    const existing = this.pendingEdits.get(uriKey);
    if (existing) {
      clearTimeout(existing.timer);
      if (existing.taskId !== activeTask.id) {
        this.pendingEdits.delete(uriKey);
        await this.flushEdit(existing);
      }
    }

    const filePath = this.workspaceRelativePath(event.document.uri);
    const pending: PendingEdit = {
      taskId: activeTask.id,
      filePath,
      before: existing?.taskId === activeTask.id ? existing.before : before,
      after,
      timer: setTimeout(() => {
        this.pendingEdits.delete(uriKey);
        this.flushEdit(pending).catch((error) => {
          this.output.appendLine(`CAMS file capture failed: ${error instanceof Error ? error.message : String(error)}`);
        });
      }, settings.flushIntervalMs)
    };

    this.pendingEdits.set(uriKey, pending);
  }

  private async flushEdit(edit: PendingEdit): Promise<void> {
    const settings = getCamsSettings();
    let diff = createPatch(edit.filePath, edit.before, edit.after, 'before', 'after');
    if (diff.length > settings.maxDiffChars) {
      diff = `${diff.slice(0, settings.maxDiffChars)}\n[CAMS truncated diff at ${settings.maxDiffChars} characters]`;
    }

    await this.repository.addFileEdit(edit.taskId, edit.filePath, diff);
    this.onAfterFlush?.();
  }

  private shouldCaptureDocument(document: vscode.TextDocument): boolean {
    if (document.uri.scheme !== 'file' || document.isUntitled) {
      return false;
    }
    if (document.languageId === 'Log' || document.languageId === 'output') {
      return false;
    }
    if (!vscode.workspace.getWorkspaceFolder(document.uri)) {
      return false;
    }
    if (looksBinary(document)) {
      return false;
    }
    return true;
  }

  private workspaceRelativePath(uri: vscode.Uri): string {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
      return uri.fsPath;
    }
    return path.relative(workspaceFolder.uri.fsPath, uri.fsPath).replace(/\\/g, '/');
  }
}

function looksBinary(document: vscode.TextDocument): boolean {
  const sample = document.getText().slice(0, 4000);
  return sample.includes('\u0000');
}
