import * as vscode from 'vscode';
import { resolveAIProvider } from '../ai';
import { ConsentManager } from '../config/consent';
import { SecretsStore } from '../config/secrets';
import { TaskRepository } from '../storage/taskRepository';
import { ContinuitySettings, ExtractionResult } from '../types';

export interface SnapshotDeps {
  repository: TaskRepository;
  secrets: SecretsStore;
  consent: ConsentManager;
  settings: () => ContinuitySettings;
  output: vscode.OutputChannel;
}

export async function snapshotTask(deps: SnapshotDeps): Promise<void> {
  const activeTask = await deps.repository.getActiveTask();
  if (!activeTask) {
    await vscode.window.showWarningMessage('Continuity: no active session yet — try again in a moment.');
    return;
  }

  const snapshot = await getSnapshotText();
  if (!snapshot) return;

  await deps.repository.addEvent(activeTask.id, 'snapshot', snapshot, {
    source: 'manual',
    charCount: snapshot.length
  });

  const settings = deps.settings();

  if (!settings.aiAutoExtract) {
    await vscode.window.showInformationMessage('Continuity: snapshot saved.');
    return;
  }
  if (settings.offlineMode) {
    await vscode.window.showInformationMessage('Continuity: snapshot saved (offline mode — extraction skipped).');
    return;
  }

  const resolution = await resolveAIProvider(settings, deps.secrets);
  if (!resolution.provider) {
    await vscode.window.showInformationMessage(`Continuity: snapshot saved. ${resolution.reason ?? ''}`.trim());
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Continuity: extracting context…'
    },
    async () => {
      try {
        const result = await resolution.provider!.extract(snapshot);
        await persistExtraction(deps.repository, activeTask.id, result, 'continuity-service');
        const total =
          result.decisions.length + result.assumptions.length + result.pending.length + (result.goal ? 1 : 0);
        await vscode.window.showInformationMessage(
          total === 0
            ? 'Continuity: snapshot saved (nothing extractable found).'
            : `Continuity: snapshot saved + ${total} item${total === 1 ? '' : 's'} extracted.`
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        deps.output.appendLine(`AI extraction failed: ${message}`);
        await vscode.window.showWarningMessage(`Continuity: snapshot saved, extraction failed — ${message}`);
      }
    }
  );
}

async function persistExtraction(
  repository: TaskRepository,
  taskId: string,
  result: ExtractionResult,
  source: string
): Promise<void> {
  if (result.goal) {
    await repository.addEvent(taskId, 'goal', result.goal, { source });
  }
  for (const decision of result.decisions) {
    await repository.addEvent(taskId, 'decision', decision, { source });
  }
  for (const assumption of result.assumptions) {
    await repository.addEvent(taskId, 'assumption', assumption, { source });
  }
  for (const pending of result.pending) {
    await repository.addEvent(taskId, 'pending', pending, { source });
  }
}

async function getSnapshotText(): Promise<string | undefined> {
  const editor = vscode.window.activeTextEditor;
  const selectedText = editor ? editor.document.getText(editor.selection).trim() : '';
  if (selectedText.length > 0) return selectedText;

  const pasted = await vscode.window.showInputBox({
    title: 'Continuity: Save Context Snapshot',
    prompt: 'Paste the AI chat text you want to preserve.',
    placeHolder: 'Paste conversation context here…',
    ignoreFocusOut: true
  });

  const value = pasted?.trim();
  if (!value) {
    await vscode.window.showWarningMessage('Continuity: empty snapshots are ignored.');
    return undefined;
  }
  return value;
}
