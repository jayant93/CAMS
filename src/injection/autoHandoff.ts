import * as vscode from 'vscode';
import {
  bundleActivityForEnrichment,
  dedupeAgainstExisting,
  hasEnrichableContent,
  resolveAIProvider
} from '../ai';
import { AssistantSwitch } from '../capture/assistantWatcher';
import { ConsentManager } from '../config/consent';
import { SecretsStore } from '../config/secrets';
import { TaskRepository } from '../storage/taskRepository';
import { ContinuitySettings } from '../types';
import { applyEnrichment } from './enrichmentContext';
import { buildHandoffPrompt } from './promptEngine';

const MIN_HANDOFF_INTERVAL_MS = 30_000;

export interface AutoHandoffDeps {
  repository: TaskRepository;
  settings: () => ContinuitySettings;
  output: vscode.OutputChannel;
  switchInfo: AssistantSwitch;
  flushFileWatcher: () => Promise<void>;
  secrets: SecretsStore;
  consent: ConsentManager;
}

let lastHandoffAt = 0;

export async function runAutoHandoff(deps: AutoHandoffDeps): Promise<void> {
  const settings = deps.settings();
  if (!settings.autoHandoffOnAssistantSwitch) return;

  const now = Date.now();
  if (now - lastHandoffAt < MIN_HANDOFF_INTERVAL_MS) {
    deps.output.appendLine('Auto handoff skipped: throttled.');
    return;
  }

  const active = await deps.repository.getActiveTask();
  if (!active) {
    deps.output.appendLine('Auto handoff skipped: no active session.');
    return;
  }

  await deps.flushFileWatcher();

  const ctx = await deps.repository.getTaskContext(active.id);
  if (!ctx) return;
  if (ctx.events.length === 0 && ctx.fileEdits.length === 0) {
    deps.output.appendLine('Auto handoff skipped: nothing captured yet.');
    return;
  }

  // 1. Instant local baseline — always available regardless of AI tier.
  const baselinePrompt = buildHandoffPrompt(ctx, {
    maxChars: settings.promptMaxChars,
    targetAssistant: deps.switchInfo.to,
    isFreeMode: true
  });
  await vscode.env.clipboard.writeText(baselinePrompt);
  lastHandoffAt = now;

  vscode.window.setStatusBarMessage(
    `$(history) Continuity → ${deps.switchInfo.to}: handoff copied. Paste with Ctrl+V`,
    8_000
  );
  deps.output.appendLine(
    `Auto handoff prepared for ${deps.switchInfo.to} (${baselinePrompt.length} chars, local baseline).`
  );

  // 2. AI enrichment — fires for all users (free + pro). Rate limiting is
  //    enforced server-side. Overwrites clipboard only if user hasn't pasted yet.
  if (!settings.enrichHandoffWithAI || settings.offlineMode) return;
  if (!hasEnrichableContent(ctx)) {
    deps.output.appendLine('Enrichment skipped: no diffs or notes to send.');
    return;
  }

  const resolution = await resolveAIProvider(settings, deps.secrets);
  if (!resolution.provider) {
    deps.output.appendLine(`Enrichment skipped: ${resolution.reason ?? 'no provider'}.`);
    return;
  }

  deps.output.appendLine('Enriching handoff via Continuity AI service…');

  try {
    const bundle = bundleActivityForEnrichment(ctx);
    const raw = await resolution.provider.enrichActivity(bundle);
    const enriched = dedupeAgainstExisting(raw, ctx);

    const enrichedPrompt = buildHandoffPrompt(applyEnrichment(ctx, enriched), {
      maxChars: settings.promptMaxChars,
      targetAssistant: deps.switchInfo.to,
      isFreeMode: false
    });

    const currentClipboard = await vscode.env.clipboard.readText();
    if (currentClipboard !== baselinePrompt) {
      deps.output.appendLine('Enrichment ready, but clipboard already replaced by user — leaving as-is.');
      return;
    }

    await vscode.env.clipboard.writeText(enrichedPrompt);
    const itemCount =
      enriched.decisions.length + enriched.assumptions.length + enriched.pending.length;
    vscode.window.setStatusBarMessage(
      `$(sparkle) Continuity → ${deps.switchInfo.to}: AI-enriched handoff ready (+${itemCount} items)`,
      8_000
    );
    deps.output.appendLine(
      `Enrichment applied for ${deps.switchInfo.to} (+${itemCount} items, ${enrichedPrompt.length} chars).`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Surface rate-limit errors as a notification; swallow other failures silently.
    if (message.includes('Daily AI request limit')) {
      vscode.window.setStatusBarMessage(
        `$(warning) Continuity: ${message}`,
        10_000
      );
    }
    deps.output.appendLine(`Enrichment failed: ${message}`);
  }
}

export { applyEnrichment } from './enrichmentContext';

export function resetAutoHandoffThrottleForTests(): void {
  lastHandoffAt = 0;
}
