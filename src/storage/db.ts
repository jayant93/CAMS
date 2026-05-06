import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { schemaSql } from './migrations';

export class ContinuityDatabase {
  private sql?: SqlJsStatic;
  private db?: Database;
  private dbPath?: string;
  private writeQueue: Promise<void> = Promise.resolve();

  async initialize(context: vscode.ExtensionContext): Promise<void> {
    // Use workspace-scoped storage so each project gets its own database.
    // Falls back to global storage only when VS Code is opened without a folder.
    const storageUri = context.storageUri ?? context.globalStorageUri;
    const wasmDir = path.join(context.extensionPath, 'lib');
    await this.initializeAtPath(storageUri.fsPath, wasmDir);
  }

  /** Initialise with plain file-system paths — used by tests (no vscode context needed). */
  async initializeAtPath(storageFsPath: string, wasmDir: string): Promise<void> {
    await fs.mkdir(storageFsPath, { recursive: true });

    this.sql = await initSqlJs({
      locateFile: (file) => path.join(wasmDir, file)
    });

    this.dbPath = path.join(storageFsPath, 'continuity.sqlite');

    try {
      const bytes = await fs.readFile(this.dbPath);
      this.db = new this.sql.Database(bytes);
    } catch (error) {
      this.db = new this.sql.Database();
    }

    this.database.run('PRAGMA foreign_keys = ON;');
    this.database.run(schemaSql);
    await this.persist();
  }

  get database(): Database {
    if (!this.db) {
      throw new Error('Continuity database has not been initialized.');
    }
    return this.db;
  }

  async persist(): Promise<void> {
    const db = this.database;
    const dbPath = this.dbPath;
    if (!dbPath) {
      throw new Error('Continuity database path has not been initialized.');
    }

    this.writeQueue = this.writeQueue.then(async () => {
      const bytes = db.export();
      await fs.writeFile(dbPath, Buffer.from(bytes));
    });

    return this.writeQueue;
  }

  dispose(): void {
    this.db?.close();
  }
}
