import * as vscode from 'vscode';
import { TaskRepository } from '../storage/taskRepository';
import { Task, FileEdit } from '../types';

export class CamsSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'camsAI.sidebar';

  private _view?: vscode.WebviewView;
  private _activeTask?: Task;
  private _tier: { label: string; detail: string } = { label: 'Free', detail: '' };

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _repository: TaskRepository
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'startTask':
          await vscode.commands.executeCommand('camsAI.startTask');
          await this.refreshData();
          break;
        case 'renameTask':
          await vscode.commands.executeCommand('camsAI.renameTask');
          await this.refreshData();
          break;
        case 'snapshotTask':
          await vscode.commands.executeCommand('camsAI.snapshotTask');
          await this.refreshData();
          break;
        case 'continueTask':
          await vscode.commands.executeCommand('camsAI.continueTask');
          await this.refreshData();
          break;
        case 'endTask':
          await vscode.commands.executeCommand('camsAI.endTask');
          await this.refreshData();
          break;
        case 'configureAI':
          await vscode.commands.executeCommand('camsAI.configureAI');
          await this.refreshData();
          break;
        case 'refreshTier':
          await vscode.commands.executeCommand('camsAI.refreshTier');
          await this.refreshData();
          break;
        case 'refresh':
          await this.refreshData();
          break;
      }
    });

    this._renderHtml();
    void this.refreshData();
  }

  /** Called from extension.ts whenever task or tier changes */
  public updateState(task: Task | undefined, tier?: { label: string; detail: string }): void {
    this._activeTask = task;
    if (tier) this._tier = tier;
    this._renderHtml();
  }

  public updateTier(tier: { label: string; detail: string }): void {
    this._tier = tier;
    this._renderHtml();
  }

  public async syncFromRepository(): Promise<void> {
    await this.refreshData();
  }

  private async refreshData(): Promise<void> {
    try {
      const activeTask = await this._repository.getActiveTask();
      this._activeTask = activeTask ?? undefined;

      if (this._view && activeTask) {
        const ctx = await this._repository.getTaskContext(activeTask.id);
        if (ctx) {
          this._view.webview.postMessage({
            type: 'stateUpdate',
            task: activeTask,
            tier: this._tier,
            events: ctx.events.slice(-20),
            fileEdits: ctx.fileEdits.slice(-10).map((e: FileEdit) => ({
              filePath: e.filePath,
              timestamp: e.timestamp
            }))
          });
        }
      }
      this._renderHtml();
    } catch {
      // Silently ignore refresh errors
    }
  }

  private _renderHtml(): void {
    if (!this._view) return;
    this._view.webview.html = this._getHtmlContent();
  }

  private _getHtmlContent(): string {
    const task = this._activeTask;
    const tierLabel = this._tier.label;
    const tierDetail = this._tier.detail;

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}' 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-inline';">
  <title>camsAI</title>
  <style nonce="${nonce}">
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: var(--vscode-font-family, 'Segoe UI', system-ui, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background, transparent);
      padding: 0;
      overflow-x: hidden;
    }

    .panel {
      padding: 12px 14px;
    }

    /* ── Header ── */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .header-title {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.5px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .header-title .logo {
      width: 18px; height: 18px;
      border-radius: 4px;
      background: linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #c084fc 100%);
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; color: white; font-weight: 800;
    }
    .refresh-btn {
      background: none; border: none; cursor: pointer;
      color: var(--vscode-foreground);
      opacity: 0.5; transition: opacity 0.2s, transform 0.3s;
      font-size: 14px; padding: 4px;
    }
    .refresh-btn:hover { opacity: 1; transform: rotate(180deg); }

    /* ── Session Card ── */
    .session-card {
      background: var(--vscode-editor-background, rgba(255,255,255,0.04));
      border: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.08));
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 14px;
      position: relative;
      overflow: hidden;
    }
    .session-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: linear-gradient(90deg, #7c3aed, #a855f7, #c084fc);
      opacity: 0.8;
    }
    .session-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
    }
    .session-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--vscode-foreground);
      word-break: break-word;
      line-height: 1.4;
    }
    .session-idle {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }

    /* ── Tier Badge ── */
    .tier-container {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.06));
    }
    .tier-badge {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.5px;
      padding: 2px 8px;
      border-radius: 10px;
      text-transform: uppercase;
    }
    .tier-free {
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.25);
    }
    .tier-pro {
      background: linear-gradient(135deg, rgba(124, 58, 237, 0.2), rgba(168, 85, 247, 0.2));
      color: #c084fc;
      border: 1px solid rgba(168, 85, 247, 0.3);
    }
    .tier-offline {
      background: rgba(156, 163, 175, 0.15);
      color: #9ca3af;
      border: 1px solid rgba(156, 163, 175, 0.25);
    }
    .tier-detail {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.3;
    }

    /* ── Section ── */
    .section {
      margin-bottom: 16px;
    }
    .section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .section-title .dot {
      width: 5px; height: 5px;
      border-radius: 50%;
      background: #a855f7;
      flex-shrink: 0;
    }

    /* ── Action Buttons ── */
    .action-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .action-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 10px;
      background: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.06));
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
      border: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.08));
      border-radius: 6px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      transition: all 0.15s ease;
      font-family: inherit;
      text-align: left;
      line-height: 1.3;
    }
    .action-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.1));
      border-color: rgba(168, 85, 247, 0.3);
      transform: translateY(-1px);
    }
    .action-btn:active {
      transform: translateY(0);
    }
    .action-btn .icon {
      font-size: 14px;
      flex-shrink: 0;
      width: 18px;
      text-align: center;
    }
    .action-btn.primary {
      grid-column: 1 / -1;
      background: linear-gradient(135deg, rgba(124, 58, 237, 0.2), rgba(168, 85, 247, 0.15));
      border-color: rgba(168, 85, 247, 0.3);
      justify-content: center;
      font-weight: 600;
      padding: 10px;
    }
    .action-btn.primary:hover {
      background: linear-gradient(135deg, rgba(124, 58, 237, 0.3), rgba(168, 85, 247, 0.25));
      border-color: rgba(168, 85, 247, 0.5);
    }
    .action-btn.danger {
      color: var(--vscode-errorForeground, #f87171);
    }
    .action-btn.danger:hover {
      border-color: rgba(248, 113, 113, 0.3);
      background: rgba(248, 113, 113, 0.08);
    }

    /* ── Activity Feed ── */
    .activity-list {
      list-style: none;
    }
    .activity-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 6px 0;
      border-bottom: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.04));
      font-size: 11px;
      line-height: 1.4;
    }
    .activity-item:last-child { border-bottom: none; }
    .activity-icon {
      width: 20px; height: 20px;
      border-radius: 4px;
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; flex-shrink: 0;
      margin-top: 1px;
    }
    .activity-icon.file { background: rgba(59, 130, 246, 0.12); color: #60a5fa; }
    .activity-icon.snapshot { background: rgba(16, 185, 129, 0.12); color: #34d399; }
    .activity-icon.goal { background: rgba(245, 158, 11, 0.12); color: #fbbf24; }
    .activity-icon.decision { background: rgba(168, 85, 247, 0.12); color: #c084fc; }
    .activity-icon.assumption { background: rgba(236, 72, 153, 0.12); color: #f472b6; }
    .activity-icon.pending { background: rgba(251, 146, 60, 0.12); color: #fb923c; }

    .activity-content {
      flex: 1;
      min-width: 0;
    }
    .activity-type {
      font-weight: 600;
      color: var(--vscode-foreground);
    }
    .activity-text {
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
      max-width: 100%;
    }
    .activity-time {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      opacity: 0.7;
      white-space: nowrap;
      flex-shrink: 0;
      margin-top: 2px;
    }

    /* ── Empty State ── */
    .empty-state {
      text-align: center;
      padding: 20px 10px;
      color: var(--vscode-descriptionForeground);
    }
    .empty-state .empty-icon {
      font-size: 28px;
      margin-bottom: 8px;
      opacity: 0.4;
    }
    .empty-state p {
      font-size: 11px;
      line-height: 1.5;
    }

    /* ── Scrollbar ── */
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-background, rgba(255,255,255,0.1));
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: var(--vscode-scrollbarSlider-hoverBackground, rgba(255,255,255,0.2));
    }

    /* ── Animations ── */
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .session-card, .section { animation: fadeIn 0.25s ease-out; }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .status-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: #34d399;
      animation: pulse 2s ease-in-out infinite;
      flex-shrink: 0;
    }
    .status-dot.idle {
      background: #9ca3af;
      animation: none;
    }
  </style>
</head>
<body>
  <div class="panel">

    <!-- Header -->
    <div class="header">
      <div class="header-title">
        <div class="logo">C</div>
        camsAI
      </div>
      <button class="refresh-btn" data-command="refresh" title="Refresh">↻</button>
    </div>

    <!-- Session Status Card -->
    <div class="session-card">
      <div class="session-label" style="display:flex; align-items:center; gap:6px;">
        <div class="status-dot ${task ? '' : 'idle'}"></div>
        ${task ? 'ACTIVE SESSION' : 'NO ACTIVE SESSION'}
      </div>
      <div class="session-name ${task ? '' : 'session-idle'}">
        ${task ? escapeHtml(task.name) : 'Waiting for activity…'}
      </div>
      ${task ? `<div style="font-size:10px; color:var(--vscode-descriptionForeground); margin-top:6px;">Started ${humanizeTime(task.createdAt)}</div>` : ''}

      <div class="tier-container">
        <span class="tier-badge tier-${tierLabel.toLowerCase()}">${tierLabel === 'Pro' ? '✦ ' : ''}${tierLabel}</span>
        <span class="tier-detail">${escapeHtml(tierDetail)}</span>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="section">
      <div class="section-title"><div class="dot"></div> Quick Actions</div>
      <div class="action-grid">
        <button class="action-btn primary" data-command="continueTask">
          <span class="icon">📋</span> Continue Task In…
        </button>
        <button class="action-btn" data-command="snapshotTask">
          <span class="icon">📸</span> Save Snapshot
        </button>
        <button class="action-btn" data-command="renameTask">
          <span class="icon">✏️</span> Rename Session
        </button>
        <button class="action-btn" data-command="startTask">
          <span class="icon">🚀</span> Name Session
        </button>
        <button class="action-btn" data-command="configureAI">
          <span class="icon">⚙️</span> Configure Pro
        </button>
        <button class="action-btn danger" data-command="endTask">
          <span class="icon">⏹️</span> End Session
        </button>
      </div>
    </div>

    <!-- Recent Activity -->
    <div class="section" id="activity-section">
      <div class="section-title"><div class="dot"></div> Recent Activity</div>
      <div id="activity-feed">
        <div class="empty-state">
          <div class="empty-icon">📝</div>
          <p>No activity yet.<br>Start editing files to see context here.</p>
        </div>
      </div>
    </div>

  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    function sendCommand(cmd) {
      vscode.postMessage({ command: cmd });
    }

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest('[data-command]');
      if (!(button instanceof HTMLElement)) return;
      const command = button.getAttribute('data-command');
      if (!command) return;
      sendCommand(command);
    });

    // Listen for data updates from the extension
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'stateUpdate') {
        renderActivity(msg.events || [], msg.fileEdits || []);
      }
    });

    function renderActivity(events, fileEdits) {
      const feed = document.getElementById('activity-feed');
      if (!feed) return;

      const items = [];

      // Merge events and file edits into a combined feed
      for (const evt of events) {
        items.push({
          type: evt.type,
          content: evt.content,
          timestamp: evt.timestamp
        });
      }
      for (const edit of fileEdits) {
        items.push({
          type: 'file_change',
          content: edit.filePath,
          timestamp: edit.timestamp
        });
      }

      // Sort by timestamp descending (most recent first)
      items.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      const display = items.slice(0, 15);

      if (display.length === 0) {
        feed.innerHTML = '<div class="empty-state"><div class="empty-icon">📝</div><p>No activity yet.<br>Start editing files to see context here.</p></div>';
        return;
      }

      const iconMap = {
        file_change: { cls: 'file', icon: '📄' },
        snapshot: { cls: 'snapshot', icon: '📸' },
        goal: { cls: 'goal', icon: '🎯' },
        decision: { cls: 'decision', icon: '⚡' },
        assumption: { cls: 'assumption', icon: '💡' },
        pending: { cls: 'pending', icon: '⏳' }
      };

      feed.innerHTML = '<ul class="activity-list">' + display.map(item => {
        const info = iconMap[item.type] || { cls: 'file', icon: '📌' };
        const text = truncate(item.content || '', 60);
        const time = formatTime(item.timestamp);
        return '<li class="activity-item">' +
          '<div class="activity-icon ' + info.cls + '">' + info.icon + '</div>' +
          '<div class="activity-content">' +
            '<span class="activity-type">' + capitalize(item.type.replace('_', ' ')) + '</span>' +
            '<span class="activity-text" title="' + escapeAttr(item.content || '') + '">' + escapeStr(text) + '</span>' +
          '</div>' +
          '<span class="activity-time">' + time + '</span>' +
        '</li>';
      }).join('') + '</ul>';
    }

    function truncate(str, max) {
      return str.length > max ? str.slice(0, max) + '…' : str;
    }
    function capitalize(str) {
      return str.charAt(0).toUpperCase() + str.slice(1);
    }
    function escapeStr(str) {
      const d = document.createElement('div');
      d.textContent = str;
      return d.innerHTML;
    }
    function escapeAttr(str) {
      return str.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    function formatTime(iso) {
      if (!iso) return '';
      try {
        const d = new Date(iso);
        const now = new Date();
        const diff = Math.floor((now - d) / 60000);
        if (diff < 1) return 'now';
        if (diff < 60) return diff + 'm';
        if (diff < 1440) return Math.floor(diff / 60) + 'h';
        return Math.floor(diff / 1440) + 'd';
      } catch { return ''; }
    }
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function humanizeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  } catch {
    return isoString;
  }
}
