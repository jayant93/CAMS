import * as vscode from 'vscode';
import {
  bundleActivityForEnrichment,
  dedupeAgainstExisting,
  hasEnrichableContent,
  resolveAIProvider
} from '../ai';
import { ConsentManager } from '../config/consent';
import { SecretsStore } from '../config/secrets';
import { applyEnrichment } from '../injection/autoHandoff';
import { copyPromptToClipboard, pickTargetAssistant } from '../injection/delivery';
import { buildHandoffPrompt } from '../injection/promptEngine';
import { TaskRepository } from '../storage/taskRepository';
import { ContinuitySettings } from '../types';

export interface ContinueDeps {
  repository: TaskRepository;
  settings: () => ContinuitySettings;
  secrets: SecretsStore;
  consent: ConsentManager;
  output: vscode.OutputChannel;
}

export async function continueTask(deps: ContinueDeps): Promise<void> {
  const activeTask = await deps.repository.getActiveTask();
  if (!activeTask) {
    await vscode.window.showWarningMessage('Continuity: no active session yet.');
    return;
  }

  const targetAssistant = await pickTargetAssistant();
  if (!targetAssistant) return;

  const ctx = await deps.repository.getTaskContext(activeTask.id);
  if (!ctx) {
    await vscode.window.showErrorMessage('Continuity: active session context could not be loaded.');
    return;
  }

  const settings = deps.settings();
  const baseline = buildHandoffPrompt(ctx, {
    maxChars: settings.promptMaxChars,
    targetAssistant,
    isFreeMode: true
  });

  const useEnrichment =
    settings.enrichHandoffWithAI &&
    hasEnrichableContent(ctx) &&
    deps.consent.hasExtractionConsent();

  if (!useEnrichment) {
    await copyPromptToClipboard(baseline, targetAssistant);
    return;
  }

  const resolution = await resolveAIProvider(settings, deps.secrets);
  if (!resolution.provider) {
    await copyPromptToClipboard(baseline, targetAssistant);
    deps.output.appendLine(
      `Continue: enrichment skipped (Free tier): ${resolution.reason ?? 'no provider'}.`
    );
    return;
  }

  const provider = resolution.provider;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Continuity: enriching handoff via ${provider.displayName}…`
    },
    async () => {
      try {
        const bundle = bundleActivityForEnrichment(ctx);
        const raw = await provider.enrichActivity(bundle);
        const enriched = dedupeAgainstExisting(raw, ctx);
        const prompt = buildHandoffPrompt(applyEnrichment(ctx, enriched), {
          maxChars: settings.promptMaxChars,
          targetAssistant,
          isFreeMode: false
        });
        const itemCount =
          enriched.decisions.length + enriched.assumptions.length + enriched.pending.length;
        await vscode.env.clipboard.writeText(prompt);
        await vscode.window.showInformationMessage(
          itemCount === 0
            ? `Continuity: handoff for ${targetAssistant} copied (AI added no new items).`
            : `Continuity: AI-enriched handoff for ${targetAssistant} copied (+${itemCount} items).`
        );
        deps.output.appendLine(
          `Continue: enriched handoff for ${targetAssistant} (+${itemCount} items, ${prompt.length} chars).`
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        deps.output.appendLine(`Continue enrichment failed: ${message}`);
        await vscode.env.clipboard.writeText(baseline);
        await vscode.window.showWarningMessage(
          `Continuity: handoff for ${targetAssistant} copied (enrichment failed: ${message}).`
        );
      }
    }
  );
}
