import * as vscode from 'vscode';

interface AssistantPattern {
  match: string;
  name: string;
}

const PATTERNS: AssistantPattern[] = [
  { match: 'github.copilot', name: 'GitHub Copilot' },
  { match: 'copilot-chat', name: 'GitHub Copilot' },
  { match: 'workbench.panel.chat', name: 'GitHub Copilot' },
  { match: 'workbench.panel.aichat', name: 'GitHub Copilot' },
  { match: 'inlineChat', name: 'GitHub Copilot' },
  { match: 'anthropic.claude', name: 'Claude' },
  { match: 'claude-code', name: 'Claude' },
  { match: 'claude.dev', name: 'Claude' },
  { match: 'claude', name: 'Claude' },
  { match: 'gemini', name: 'Gemini' },
  { match: 'codex', name: 'Codex' },
  { match: 'openai', name: 'ChatGPT' },
  { match: 'chatgpt', name: 'ChatGPT' },
  { match: 'continue.continue', name: 'Continue' },
  { match: 'cline', name: 'Cline' },
  { match: 'roo-cline', name: 'Roo Cline' },
  { match: 'cody', name: 'Cody' },
  { match: 'sourcegraph.cody', name: 'Cody' },
  { match: 'tabnine', name: 'Tabnine' },
  { match: 'cursor', name: 'Cursor' },
  { match: 'windsurf', name: 'Windsurf' }
];

const DEBOUNCE_MS = 500;

export interface AssistantSwitch {
  from?: string;
  to: string;
}

export class AssistantWatcher implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private lastSeen?: string;
  private debounceTimer?: NodeJS.Timeout;
  private started = false;

  constructor(
    private readonly onSwitch: (event: AssistantSwitch) => void,
    private readonly output: vscode.OutputChannel
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.lastSeen = this.detectActiveAssistant();
    this.disposables.push(
      vscode.window.tabGroups.onDidChangeTabs(() => this.recheck()),
      vscode.window.tabGroups.onDidChangeTabGroups(() => this.recheck()),
      vscode.window.onDidChangeActiveTextEditor(() => this.recheck())
    );
    this.output.appendLine(`AssistantWatcher started. Initial assistant: ${this.lastSeen ?? 'none'}.`);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    this.lastSeen = undefined;
  }

  private recheck(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      const current = this.detectActiveAssistant();
      if (!current) return;
      if (current !== this.lastSeen) {
        const event: AssistantSwitch = { from: this.lastSeen, to: current };
        this.lastSeen = current;
        this.output.appendLine(`Assistant switch detected: ${event.from ?? 'none'} -> ${event.to}.`);
        try {
          this.onSwitch(event);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.output.appendLine(`Auto-handoff handler threw: ${msg}`);
        }
      }
    }, DEBOUNCE_MS);
  }

  private detectActiveAssistant(): string | undefined {
    for (const group of vscode.window.tabGroups.all) {
      const active = group.activeTab;
      if (!active) continue;
      const name = identifyTab(active);
      if (name) return name;
    }
    return undefined;
  }

  dispose(): void {
    this.stop();
  }
}

function identifyTab(tab: vscode.Tab): string | undefined {
  const input = tab.input as { viewType?: string; notebookType?: string; uri?: vscode.Uri } | undefined;
  const viewType = input?.viewType ?? input?.notebookType ?? '';
  const uri = input?.uri?.toString() ?? '';
  const haystack = `${tab.label} ${viewType} ${uri}`.toLowerCase();
  for (const pattern of PATTERNS) {
    if (haystack.includes(pattern.match)) {
      return pattern.name;
    }
  }
  return undefined;
}
