import * as vscode from 'vscode';
import { Task } from '../types';

export interface StatusBarTier {
  label: 'Free' | 'Pro' | 'Offline';
  detail: string;
}

export class CamsStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private currentTask?: Task;
  private tier: StatusBarTier = {
    label: 'Free',
    detail: 'Local-only handoff. Run "CAMS: Configure AI" to unlock AI-enriched Pro handoff.'
  };

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'camsAI.continueTask';
    this.render();
    this.item.show();
  }

  setActiveTask(task: Task | undefined): void {
    this.currentTask = task;
    this.render();
  }

  setTier(tier: StatusBarTier): void {
    this.tier = tier;
    this.render();
  }

  private render(): void {
    const icon = this.tier.label === 'Pro' || this.tier.label === 'Offline' ? '$(sparkle)' : '$(history)';
    if (this.currentTask) {
      this.item.text = `${icon} CAMS: ${this.currentTask.name}`;
      this.item.tooltip =
        `Active session: ${this.currentTask.name}\n` +
        `Tier: ${this.tier.label} — ${this.tier.detail}\n` +
        `Click to copy a handoff prompt.`;
    } else {
      this.item.text = `${icon} CAMS: idle`;
      this.item.tooltip =
        `CAMS is idle.\n` +
        `Tier: ${this.tier.label} — ${this.tier.detail}\n` +
        `Click to copy a handoff prompt or run a CAMS command.`;
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
